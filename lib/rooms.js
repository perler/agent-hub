const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { launchClaude } = require('./launch');
const { cfg, expandHome, relativeTime } = require('./shared');

// Rooms: one-off shared Claude sessions with a guest. Each lives in
// <roomsDir>/sessions/<id>/meta.json (written by the rooms server, only read here).
// The room agent itself runs on the server; "Work in Room" is a normal local session
// in <roomsDir> that edits the room's Drive files, so the room has two kinds of rows.

function roomsDir() { return expandHome(cfg().get('roomsDir', '~/projects/infra/rooms') || ''); }
function roomsSessionsDir() { return path.join(roomsDir(), 'sessions'); }

function readRooms() {
  const root = roomsSessionsDir();
  let ids;
  try { ids = fs.readdirSync(root); } catch { return []; }
  const out = [];
  for (const id of ids) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(root, id, 'meta.json'), 'utf8'));
      if (m && m.id && !m.hidden) out.push(m); // "Remove" in the rooms UI sets hidden:true
    } catch {}
  }
  return out.sort((a, b) => (b.created || 0) - (a.created || 0));
}

function roomUrl(room) {
  return `${String(cfg().get('roomsUrl') || '').replace(/\/+$/, '')}/s/${room.id}`;
}
function driveUrl(room) { return room.folderLink || (room.folderId ? `https://drive.google.com/drive/folders/${room.folderId}` : null); }

// meta.json has guests:[{email}] (older rooms only guest): the first guest, then "+N" for the rest.
function guestEmails(room) { return room.guests?.length ? room.guests.map((g) => g.email) : (room.guest ? [room.guest] : []); }
function guestLabel(room) { const g = guestEmails(room); return g.length > 1 ? `${g[0]} +${g.length - 1}` : (g[0] || 'no guests yet'); }

function roomItem(room) {
  const ended = room.status !== 'active';
  const it = new vscode.TreeItem(room.topic || room.id, vscode.TreeItemCollapsibleState.None);
  const spend = `$${(room.spendUsd || 0).toFixed(2)}/$${room.capUsd}`;
  it.description = [room.id, guestLabel(room), spend].filter(Boolean).join(' · ');
  // No codicon is a bubble with three dots, so the icon is ours: a 16px outline drawn like the codicons,
  // in the theme's icon grey, or the terminal green that session rows use while live (a ThemeColor
  // cannot tint a custom SVG, hence one file per state and theme).
  const svg = (theme) => vscode.Uri.file(path.join(__dirname, '..', 'resources', `room-${ended ? '' : 'active-'}${theme}.svg`));
  it.iconPath = { light: svg('light'), dark: svg('dark') };
  it.tooltip = [
    room.topic, '',
    `Room ${room.id}`, `Status: ${room.status}`, `Guests: ${guestEmails(room).join(', ') || '-'}`, `Model: ${room.model}`,
    `Spend: ${spend}`, `Created: ${room.created ? new Date(room.created).toLocaleString() : '?'} (${room.created ? relativeTime(room.created) : '?'})`,
  ].join('\n');
  it.contextValue = driveUrl(room) ? 'room' : 'roomNoDrive';
  it.command = { command: 'agentHub.openRoom', title: 'Open Room', arguments: [{ kind: 'room', room }] };
  return it;
}

function roomGroupItem(node) {
  const it = new vscode.TreeItem(node.label,
    node.ended ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded);
  it.description = `${node.rooms.length}`;
  it.contextValue = 'roomGroup'; // no icon: group headers (Pinned, Last hour...) carry none
  return it;
}

// The room's "Work in Room" session is found again by its first prompt, not by a stored id,
// so it survives a cleared globalState and a session started by hand with the same prompt.
function roomPrompt(room) {
  return `You are working on room ${room.id} (${room.topic}). Read sessions/${room.id}/meta.json and sessions/${room.id}/transcript.md. ` +
    `The room's Google Drive folder is ${room.folderId}. Create and edit the room's files ONLY with the rooms CLI ` +
    '(/home/work/projects/infra/rooms/bin/rooms), never with the google-workspace tools: those act as perler@gmail.com and a file ' +
    'owned by that account cannot be moved into the room. The CLI acts as info@erler-edv-beratung.de (service account), the owner of ' +
    `all room files (Shared Drive "Rooms"); guests use anonymous link access. Name the Google identity whenever you mention one. ` +
    `Commands (room id ${room.id}): files <room>; doc <room> --title T [--file x.md]; doc-read <room> <fileId>; ` +
    'doc-write <room> <fileId> --file x.md (read the Doc first; refused if it changed since your read); ' +
    'sheet <room> --title T [--csv f]; sheet-read <room> <fileId> <range>; sheet-write <room> <fileId> <range> --csv f; ' +
    'adopt <room> <fileId> (copy a file your own account made, readable by link, into the room; Forms are published). ' +
    'Do not write while the room agent is mid-turn.';
}

function findWorkSession(room) {
  const dir = path.join(os.homedir(), '.claude', 'projects', roomsDir().replace(/\//g, '-'));
  const marker = `You are working on room ${room.id} (`;
  let best = null;
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return null; }
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const full = path.join(dir, f);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (!st.size || (best && st.mtimeMs < best.mtime)) continue;
    // A SessionStart hook's output can push the prompt past readSessionMeta's head window,
    // so look for the prompt in the raw first 256 KB instead.
    let head = '';
    try {
      const fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(Math.min(st.size, 262144));
      fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
      head = buf.toString('utf8');
    } catch { continue; }
    if (head.includes(marker)) {
      best = { id: f.slice(0, -'.jsonl'.length), file: full, projectFolder: path.basename(dir), mtime: st.mtimeMs };
    }
  }
  return best;
}

async function workInRoom(node, resumeSessionNode) {
  if (!node || node.kind !== 'room') return;
  const room = node.room;
  const dir = roomsDir();
  if (!fs.existsSync(dir)) { vscode.window.showErrorMessage(`Rooms folder not found: ${dir}`); return; }
  const existing = findWorkSession(room);
  if (existing) { await resumeSessionNode({ kind: 'session', session: existing }); return; }
  await launchClaude({ path: dir, label: room.id }, false, { skipNamePrompt: true, initialPrompt: roomPrompt(room) });
}

function roomCommands(reg, resumeSessionNode) {
  const room = (n) => (n && n.kind === 'room' ? n.room : null);
  reg('agentHub.openRoom', (n) => { const r = room(n); if (r) vscode.env.openExternal(vscode.Uri.parse(roomUrl(r))); });
  reg('agentHub.workInRoom', (n) => workInRoom(n, resumeSessionNode));
  reg('agentHub.copyRoomId', (n) => {
    const r = room(n); if (!r) return;
    vscode.env.clipboard.writeText(r.id);
    vscode.window.setStatusBarMessage(`Copied room id: ${r.id}`, 2000);
  });
  reg('agentHub.copyRoomLink', (n) => {
    const r = room(n); if (!r) return;
    vscode.env.clipboard.writeText(roomUrl(r));
    vscode.window.setStatusBarMessage(`Copied: ${roomUrl(r)}`, 2000);
  });
  reg('agentHub.openRoomDrive', (n) => {
    const r = room(n); const u = r && driveUrl(r);
    if (u) vscode.env.openExternal(vscode.Uri.parse(u));
  });
}

// Refresh when a meta.json changes. The rooms folder lies outside the workspace, so a
// VS Code file watcher would not see it; fs.watch does. Debounced: spend is rewritten every turn.
function watchRooms(context, onChange) {
  let watcher = null, timer = null;
  const ping = () => { clearTimeout(timer); timer = setTimeout(onChange, 1500); };
  try { watcher = fs.watch(roomsSessionsDir(), { recursive: true }, (_e, f) => { if (!f || String(f).endsWith('meta.json')) ping(); }); }
  catch { /* no rooms folder here: the 60 s refresh still picks one up later */ }
  context.subscriptions.push({ dispose: () => { clearTimeout(timer); if (watcher) watcher.close(); } });
}

module.exports = { readRooms, roomItem, roomGroupItem, roomCommands, watchRooms };
