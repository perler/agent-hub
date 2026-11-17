// sessionBridgeId finds the claude.ai id of a Claude-app (Remote Control) session
// from the CLI's own ~/.claude/sessions registry. Skips when the live example is gone.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (req, ...a) {
  if (req === 'vscode') return { workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
  return origLoad.call(this, req, ...a);
};
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sessionBridgeId } = require('../lib/session-registry');

assert.strictEqual(sessionBridgeId('00000000-0000-0000-0000-000000000000'), null);
const id = '84cab3ae-2e34-5448-9bf7-abb0192d3fda';
const live = fs.readdirSync(path.join(os.homedir(), '.claude', 'sessions')).some((f) => {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'sessions', f), 'utf8')).sessionId === id; } catch { return false; }
});
if (live) assert.strictEqual(sessionBridgeId(id), 'session_01UrsEcwtADKAmA6WMuucKCd');
console.log(live ? 'ok bridge lookup' : 'ok (live example gone, only null case checked)');
