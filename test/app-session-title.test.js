#!/usr/bin/env node
// Sessions started from the Claude app can't pick a folder: they open in ~ with the
// path title "home/work", no ai-title, and their first prompt in a queue-operation
// record (the user record lands past the 16 kB head). readSessionMeta must title and
// search them by that prompt, and leave real renames and CLI sessions alone.
//
// Run: node test/app-session-title.test.js
const fs = require('fs'), path = require('path'), os = require('os'), Module = require('module');
const orig = Module._load;
Module._load = function (req) {
  return req === 'vscode' ? { workspace: { getConfiguration: () => ({ get: (k, d) => d }) }, window: {} } : orig.apply(this, arguments);
};
const { readSessionMeta } = require('../lib/shared');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-title-'));
const folder = path.join(tmp, '-home-work');
fs.mkdirSync(folder);
let n = 0;
function session(records) {
  const f = path.join(folder, `s${n++}.jsonl`);
  fs.writeFileSync(f, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return readSessionMeta(f);
}
const pad = { type: 'queue-operation', operation: 'dequeue', content: 'x'.repeat(17000) };
const user = (t, cwd) => ({ type: 'user', cwd, timestamp: '2026-11-15T07:00:00Z', message: { content: t } });

let failed = 0;
const check = (name, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

// App session that cd'd away: its cwd now reads /home/work/tools/tailscale.
let m = session([
  { type: 'custom-title', customTitle: 'home/work' },
  { type: 'queue-operation', operation: 'enqueue', content: 'Home assistant, external url?' },
  pad, user('Home assistant, external url?', '/home/work/tools/tailscale'),
]);
check('app session titled by first prompt', m.title === 'Home assistant, external url?', m);
check('app session first prompt searchable', m.firstUserMsg === 'Home assistant, external url?', m);

m = session([
  { type: 'custom-title', customTitle: 'home/work' },
  { type: 'queue-operation', operation: 'enqueue', content: 'Fix X' },
  { type: 'ai-title', aiTitle: 'Fix the X thing' }, user('Fix X', '/home/work'),
]);
check('ai-title still wins over the prompt', m.title === 'Fix the X thing', m);

m = session([
  { type: 'custom-title', customTitle: 'My renamed session' },
  { type: 'queue-operation', operation: 'enqueue', content: 'Fix X' }, user('Fix X', '/home/work'),
]);
check('a real /rename still wins', m.title === 'My renamed session', m);

m = session([{ type: 'custom-title', customTitle: 'home/work' }, user('/inbox-zero', '/home/work')]);
check('CLI session without queued prompt keeps path title', m.title === 'home/work', m);

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
