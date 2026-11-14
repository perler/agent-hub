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
    if (msg.type === 'copy') { vscode.env.clipboard.writeText(msg.text); return; }
    if (msg.type === 'close') { panel?.dispose(); return; }
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
  /* House palette (client-tech-doc doc.css): red is the one accent, never green. */
  :root {
    --brand: #CC0000; --brand-deep: #A00000; --on-brand: #FFFFFF;
    --ink: var(--vscode-foreground, #1A202C);
    --mute: var(--vscode-descriptionForeground, #4A5568);
    --rule: var(--vscode-widget-border, var(--vscode-panel-border, #D8DEE6));
    --card: var(--vscode-editorWidget-background, #FFFFFF);
    --tint: var(--vscode-list-hoverBackground, #F5F7FA);
    --mono: var(--vscode-editor-font-family, ui-monospace, monospace);
  }
  body.vscode-dark, body.vscode-high-contrast { --brand: #E04545; --brand-deep: #F06A6A; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--ink);
    background: var(--vscode-editor-background); display: grid; place-items: center; padding: 24px; }
  .card { width: min(480px, 100%); background: var(--card); border: 1px solid var(--rule);
    border-radius: 10px; padding: 32px 28px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06); }
  [hidden] { display: none !important; }

  .zone { text-align: center; border: 1.5px dashed var(--rule); border-radius: 8px; padding: 32px 16px;
    transition: border-color .15s, background .15s; }
  body.over .zone { border-color: var(--brand); background: var(--tint); }
  .icon { width: 40px; height: 40px; color: var(--brand); margin: 0 auto 12px; display: block; }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  .path { font-family: var(--mono); font-size: 12px; color: var(--mute); margin: 0; }
  .hint { color: var(--mute); margin: 16px 0 0; font-size: 12px; }

  button { font: inherit; border-radius: 6px; padding: 7px 14px; cursor: pointer; border: 1px solid transparent; }
  button:focus-visible { outline: 2px solid var(--vscode-focusBorder, var(--brand)); outline-offset: 2px; }
  .primary { background: var(--brand); color: var(--on-brand); font-weight: 600; margin-top: 20px; }
  .primary:hover { background: var(--brand-deep); }
  .secondary { background: transparent; color: var(--ink); border-color: var(--rule); }
  .secondary:hover { background: var(--tint); }

  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .badge { flex: none; width: 32px; height: 32px; border-radius: 50%; background: var(--brand); color: var(--on-brand);
    display: grid; place-items: center; }
  .badge svg { width: 18px; height: 18px; }
  .head.busy .badge { background: transparent; border: 2px solid var(--rule); border-top-color: var(--brand);
    animation: spin .8s linear infinite; }
  .head.busy .badge svg { display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .head.busy .badge { animation: none; } }

  ol { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); max-height: 40vh; overflow: auto; }
  li { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 8px 0; border-bottom: 1px solid var(--rule); }
  .name { font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }
  .state { font-size: 12px; color: var(--mute); white-space: nowrap; }
  .note { grid-column: 1 / -1; font-size: 11px; color: var(--mute); }
  li.fail .state, li.fail .note { color: var(--vscode-errorForeground, var(--brand)); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; flex-wrap: wrap; }
  .actions .push { margin-right: auto; }
</style></head><body>
<main class="card">
  <section id="idle" class="zone">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8"/><path d="m8.5 15.5 3.5-3.5 3.5 3.5"/></svg>
    <h1>Upload to today's folder</h1>
    <p class="path">${dir}</p>
    <button id="pick" class="primary">Choose files…</button>
    <p class="hint">or drop files anywhere in this panel</p>
  </section>

  <section id="result" hidden>
    <div id="head" class="head">
      <span class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>
      <div><h1 id="title" aria-live="polite"></h1><p class="path">${dir}</p></div>
    </div>
    <ol id="list"></ol>
    <div id="actions" class="actions" hidden>
      <button id="copy" class="secondary push">Copy paths</button>
      <button id="more" class="secondary">Upload more</button>
      <button id="done" class="primary" style="margin-top:0">Done</button>
    </div>
  </section>
  <input id="input" type="file" multiple hidden>
</main>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  let batch = [], next = 0, dragDepth = 0;

  const size = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const plural = (n) => n + (n === 1 ? ' file' : ' files');

  $('pick').onclick = () => $('input').click();
  $('more').onclick = () => { $('result').hidden = true; $('idle').hidden = false; $('pick').focus(); };
  $('done').onclick = () => vscode.postMessage({ type: 'close' });
  $('copy').onclick = () => {
    vscode.postMessage({ type: 'copy', text: batch.filter((f) => f.path).map((f) => f.path).join('\\n') });
    $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy paths'; }, 1400);
  };
  $('input').onchange = () => { send($('input').files); $('input').value = ''; };

  // Drop anywhere: dragenter/leave fire per child element, so count depth.
  document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('over'); });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('over'); } });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; document.body.classList.remove('over'); send(e.dataTransfer.files); });

  async function send(fileList) {
    const files = [...fileList]; if (!files.length) return;
    batch = files.map((f) => ({ id: next++, file: f }));
    $('list').replaceChildren(...batch.map(row));
    $('idle').hidden = true; $('result').hidden = false; $('actions').hidden = true;
    render();
    for (const b of batch) {
      vscode.postMessage({ type: 'file', id: b.id, name: b.file.name, data: new Uint8Array(await b.file.arrayBuffer()) });
    }
  }

  function row(b) {
    const li = document.createElement('li');
    const name = document.createElement('span'); name.className = 'name'; name.textContent = b.file.name;
    const state = document.createElement('span'); state.className = 'state'; state.textContent = 'Saving…';
    li.append(name, state); b.li = li; b.state = state; return li;
  }

  function note(b, text) { const n = document.createElement('span'); n.className = 'note'; n.textContent = text; b.li.append(n); }

  function render() {
    const ok = batch.filter((b) => b.path).length, bad = batch.filter((b) => b.error).length;
    const finished = ok + bad === batch.length;
    $('head').classList.toggle('busy', !finished);
    if (!finished) { $('title').textContent = 'Saving ' + plural(batch.length) + '…'; return; }
    $('title').textContent = bad ? ok + ' of ' + plural(batch.length) + ' saved, ' + bad + ' failed' : plural(ok) + ' saved';
    $('copy').hidden = !ok;
    $('actions').hidden = false; $('done').focus();
  }

  window.addEventListener('message', ({ data: m }) => {
    const b = batch.find((x) => x.id === m.id); if (!b) return;
    if (m.type === 'saved') {
      b.path = m.path; b.state.textContent = size(b.file.size);
      const saved = m.path.split('/').pop();
      if (saved !== b.file.name) note(b, 'Name was taken, saved as ' + saved);
    } else {
      b.error = m.error; b.li.classList.add('fail'); b.state.textContent = 'Failed'; note(b, m.error);
    }
    render();
  });
</script></body></html>`;
}

module.exports = { openUploadPanel, todayDir, freeName };
