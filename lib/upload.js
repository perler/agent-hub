// Upload to today's transfer folder. The title-bar button cannot open a browser
// file picker itself (a picker needs a click inside the same frame), and the
// built-in explorer.upload only targets folders inside the open workspace, which
// ~/transfer usually is not. So the button opens a small panel: one click on
// "Choose files" (or a drop) and the files land in ~/transfer/<YYYY-MM-DD>.
const vscode = require('vscode');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

function todayDir() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return path.join(os.homedir(), 'transfer', `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
}

// Never overwrite: report.pdf → report-2.pdf → report-3.pdf.
function freeName(dir, name) {
  const base = path.basename(name);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  let candidate = base;
  for (let i = 2; fs.existsSync(path.join(dir, candidate)); i++) candidate = `${stem}-${i}${ext}`;
  return path.join(dir, candidate);
}

let panel;

function openUploadPanel() {
  if (panel) { panel.reveal(); return; }
  panel = vscode.window.createWebviewPanel('agentHub.upload', 'Upload to Today', vscode.ViewColumn.Active,
    { enableScripts: true });
  panel.onDidDispose(() => { panel = undefined; });
  panel.webview.html = html(panel.webview);
  panel.webview.onDidReceiveMessage((msg) => {
    if (msg.type !== 'file') return;
    const dir = todayDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
      const target = freeName(dir, msg.name);
      fs.writeFileSync(target, Buffer.from(msg.data));
      panel?.webview.postMessage({ type: 'saved', id: msg.id, path: target });
    } catch (e) {
      panel?.webview.postMessage({ type: 'failed', id: msg.id, error: e.message });
    }
  });
}

function html(webview) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const dir = todayDir().replace(os.homedir(), '~');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 24px; max-width: 640px; }
  #drop { border: 2px dashed var(--vscode-panel-border); border-radius: 8px; padding: 32px; text-align: center; }
  #drop.over { border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0;
    padding: 8px 16px; border-radius: 4px; font-size: 13px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  code { font-family: var(--vscode-editor-font-family); }
  ul { list-style: none; padding: 0; font-family: var(--vscode-editor-font-family); font-size: 12px; }
  li { padding: 2px 0; } .err { color: var(--vscode-errorForeground); } .muted { opacity: .7; }
</style></head><body>
<div id="drop">
  <button id="pick">Choose files…</button>
  <p class="muted">or drop files here — they go to <code>${dir}</code></p>
  <input id="input" type="file" multiple hidden>
</div>
<ul id="log"></ul>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const input = document.getElementById('input'), drop = document.getElementById('drop'), log = document.getElementById('log');
  let next = 0; const rows = {};
  document.getElementById('pick').onclick = () => input.click();
  input.onchange = () => { send(input.files); input.value = ''; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); send(e.dataTransfer.files); };
  async function send(files) {
    for (const f of files) {
      const id = next++; const li = document.createElement('li');
      li.textContent = '… ' + f.name; log.prepend(li); rows[id] = li;
      vscode.postMessage({ type: 'file', id, name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    }
  }
  window.addEventListener('message', ({ data: m }) => {
    const li = rows[m.id]; if (!li) return;
    if (m.type === 'saved') li.textContent = '✓ ' + m.path;
    else { li.textContent = '✗ ' + li.textContent.slice(2) + ': ' + m.error; li.className = 'err'; }
  });
</script></body></html>`;
}

module.exports = { openUploadPanel, todayDir, freeName };
