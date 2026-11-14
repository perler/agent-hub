#!/usr/bin/env node
// Tests the ☁ Upload panel (2026-11-14): the real openUploadPanel out of lib/upload.js with VS Code stubbed.
//
// What it pins down: a file posted from the webview lands in ~/transfer/<today>, the folder is created
// if missing, a second file with the same name becomes name-2.ext (never overwritten), and the webview
// is told the saved path.
//
// Run: node test/upload.test.js
const fs = require('fs'), path = require('path'), os = require('os'), Module = require('module'), assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-upload-'));
process.env.HOME = tmp;

let onMessage; const posted = [];
const vscodeStub = {
  ViewColumn: { Active: -1 },
  window: {
    createWebviewPanel: () => ({
      webview: { cspSource: 'x', set html(_) {}, onDidReceiveMessage: (f) => { onMessage = f; }, postMessage: (m) => posted.push(m) },
      onDidDispose: () => {}, reveal: () => {},
    }),
  },
};
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? vscodeStub : origLoad.call(this, req, ...rest); };

const { openUploadPanel, todayDir } = require('../lib/upload');
assert.ok(todayDir().startsWith(path.join(tmp, 'transfer') + path.sep), 'today folder is under ~/transfer');
assert.match(path.basename(todayDir()), /^\d{4}-\d{2}-\d{2}$/);

openUploadPanel();
onMessage({ type: 'file', id: 0, name: 'report.pdf', data: new Uint8Array([1, 2, 3]) });
onMessage({ type: 'file', id: 1, name: 'report.pdf', data: new Uint8Array([4]) });

const dir = todayDir();
assert.deepStrictEqual([...fs.readFileSync(path.join(dir, 'report.pdf'))], [1, 2, 3]);
assert.deepStrictEqual([...fs.readFileSync(path.join(dir, 'report-2.pdf'))], [4]);
assert.deepStrictEqual(posted, [
  { type: 'saved', id: 0, path: path.join(dir, 'report.pdf') },
  { type: 'saved', id: 1, path: path.join(dir, 'report-2.pdf') },
]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('upload: ok');
