#!/usr/bin/env node
// A pasted task name that matches verbatim, in a project the routing table has no row for
// ("🔨 Maintenance"), is placed where the bridge put it (_INBOX here) instead of being
// dropped and routed by the model. Run: node test/unmapped-project.test.js
const fs = require('fs'), path = require('path'), os = require('os'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-unmapped-'));
const clients = path.join(tmp, 'clients');
for (const d of ['_INBOX', 'BB']) fs.mkdirSync(path.join(clients, d), { recursive: true });
// A stand-in for the asana CLI dir: config.js and lib/bridge-pure.js next to the binary.
const cli = path.join(tmp, 'asana-cli');
fs.mkdirSync(path.join(cli, 'lib'), { recursive: true });
fs.writeFileSync(path.join(cli, 'asana'), '#!/bin/sh\n', { mode: 0o755 });
fs.writeFileSync(path.join(cli, 'config.js'), 'module.exports = { CLIENT_CODE_MAPPING: { "MP Produktion": "BB" } };');
for (const f of ['bridge-pure.js', 'dux.js']) fs.copyFileSync(path.join('/home/work/projects/infra/asana/lib', f), path.join(cli, 'lib', f));
process.env.HOME = tmp;
fs.mkdirSync(path.join(tmp, '.cache', 'claude-code-helper'), { recursive: true });
const settings = { asanaCommand: path.join(cli, 'asana'), clientsDir: clients, projectsDir: path.join(tmp, 'projects'), scratchDir: path.join(tmp, 'tasks') };
const vscode = { QuickPickItemKind: { Separator: -1 }, workspace: { getConfiguration: () => ({ get: (k) => settings[k] }) },
  window: { showErrorMessage: (m) => { throw new Error(m); } } };
const origLoad = Module._load;
Module._load = function (req) {
  if (req === 'vscode') return vscode;
  if (req === './launch') return { launchClaude: async () => null };
  return origLoad.apply(this, arguments);
};
const asana = require('../lib/asana');
const nt = require('../lib/newtask');
Module._load = origLoad;
fs.writeFileSync(asana.asanaCacheFile(), JSON.stringify([{ gid: 'p-bb', name: 'BB EDV' }]));
let failed = 0;
const check = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

const targets = nt.listTargets();
const task = { gid: '1220412609174338', name: '✨ 🔴 tst001-patch', completed: false, projects: [{ gid: 'p-maint', name: '🔨 Maintenance' }] };
const { names } = asana.asanaTaskNames('✨ 🔴 tst001-patch', targets);
let r = asana.matchAsanaTask(names, [task], targets);
check('unmapped project lands where the bridge puts it (_INBOX)', r && r.target && r.target.id === 'client:_INBOX' && r.task.gid === task.gid, r && r.target);
r = asana.matchAsanaTask(names, [{ ...task, gid: '1', completed: true }, task, { ...task, gid: '2', completed: true }], targets);
check('older completed namesakes in the same project still resolve to the open one', r && r.target && r.target.id === 'client:_INBOX' && r.task.gid === task.gid, r);
r = asana.matchAsanaTask(names, [{ ...task, projects: [{ gid: 'p-mp', name: 'MP Produktion' }] }], targets);
check('bridge mapping names the client', r && r.target && r.target.id === 'client:BB', r && r.target);
r = asana.matchAsanaTask(names, [{ ...task, projects: [{ gid: 'p-bb', name: 'BB EDV' }] }], targets);
check('a project the table knows still wins', r && r.target && r.target.id === 'client:BB', r && r.target);

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
