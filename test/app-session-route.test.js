#!/usr/bin/env node
// Sessions started from the Claude app are routed by a hook, which records the target
// folder in ~/.cache/app-session-routes/<id>.json. The list must show such a session
// under the routed folder (row description, tooltip, filter) and must NOT change the
// cwd used to resume it.
//
// Run: node test/app-session-route.test.js
const fs = require('fs'), path = require('path'), os = require('os'), Module = require('module');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-route-'));
process.env.HOME = home;
os.homedir = () => home;
Module._load = ((orig) => function (req) {
  if (req === 'vscode') {
    return {
      workspace: { getConfiguration: () => ({ get: (k, d) => d }) }, window: {},
      EventEmitter: class { constructor() { this.event = () => {}; } fire() {} },
      TreeItem: class { constructor(l) { this.label = l; } },
      TreeItemCollapsibleState: { None: 0, Expanded: 2 },
      MarkdownString: class { constructor() { this.value = ''; } appendMarkdown(s) { this.value += s; } },
      ThemeIcon: class {}, ThemeColor: class {}, commands: { executeCommand() {} },
    };
  }
  return orig.apply(this, arguments);
})(Module._load);

const routes = path.join(home, '.cache', 'app-session-routes');
fs.mkdirSync(routes, { recursive: true });
const folder = path.join(home, '.claude', 'projects', '-home-work');
fs.mkdirSync(folder, { recursive: true });
const now = new Date().toISOString();
function session(id) {
  fs.writeFileSync(path.join(folder, `${id}.jsonl`), JSON.stringify({
    type: 'user', cwd: '/home/work', timestamp: now, message: { content: 'hello ' + id }, clientPlatform: 'ios',
  }) + '\n');
}
['routed', 'unrouted', 'noroute'].forEach(session);
fs.writeFileSync(path.join(routes, 'routed.json'), JSON.stringify({ session_id: 'routed', routed: true, dir: '/home/work/clients/PPHQ' }));
fs.writeFileSync(path.join(routes, 'unrouted.json'), JSON.stringify({ session_id: 'unrouted', routed: false, dir: null }));
fs.writeFileSync(path.join(routes, 'broken.json'), '{nope');

const { SessionsProvider, getSessionCwd } = require('../lib/sessions');
let failed = 0;
const check = (name, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

const p = new SessionsProvider();
const rows = Object.fromEntries(p._load().flatMap((g) => g.sessions).map((s) => [s.id, s]));
const item = (id) => p.getTreeItem({ kind: 'session', session: rows[id] });

let it = item('routed');
check('routed: description names the routed folder', /^PPHQ · /.test(it.description), it.description);
check('routed: tooltip has the routed line', it.tooltip.value.includes('Routed from the Claude app to'), it.tooltip);
check('routed: resume cwd unchanged', getSessionCwd(rows.routed) === '/home/work', getSessionCwd(rows.routed));
check('routed: filter matches the routed dir', p._matches(rows.routed, 'clients/pphq'));

for (const id of ['unrouted', 'noroute']) {
  it = item(id);
  check(`${id}: description unchanged`, !/·/.test(it.description.replace(/ago.*/, '')) && !it.description.includes('PPHQ'), it.description);
  check(`${id}: no routed tooltip line`, !it.tooltip.value.includes('Routed from'), it.tooltip);
  check(`${id}: filter does not match`, !p._matches(rows[id], 'clients/pphq'));
  check(`${id}: cwd unchanged`, getSessionCwd(rows[id]) === '/home/work');
}
process.exit(failed ? 1 : 0);
