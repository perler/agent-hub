#!/usr/bin/env node
// Tests the Claude Code Helper -> Agent Hub rename shims: cfg() in lib/shared.js reads
// agentHub.X and falls back to claudeHelper.X only when the new key is unset, and
// lib/migrate.js imports the old extension's exported globalState once.
//
// Run: node test/rename-compat.test.js
const fs = require('fs'), path = require('path'), os = require('os'), Module = require('module');

// Fake settings: { section: { key: explicitValue } }; defaults come from `dflt` per section.
const explicit = { agentHub: {}, claudeHelper: {} };
const vscode = {
  workspace: {
    getConfiguration: (section) => ({
      get: (k, d) => (k in explicit[section] ? explicit[section][k] : d),
      inspect: (k) => (k in explicit[section] ? { globalValue: explicit[section][k] } : { defaultValue: 1 }),
    }),
  },
  window: {}, QuickPickItemKind: {}, ProgressLocation: {},
};
const orig = Module._load;
Module._load = function (req) { return req === 'vscode' ? vscode : orig.apply(this, arguments); };
const { cfg } = require('../lib/shared');
const { importOldState } = require('../lib/migrate');

let failed = 0;
const check = (n, c, d) => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

check('nothing set: default', cfg().get('useTmux', 'dflt') === 'dflt');
explicit.claudeHelper.useTmux = false;
check('only old set: old value wins', cfg().get('useTmux', true) === false);
explicit.agentHub.useTmux = true;
check('both set: new value wins', cfg().get('useTmux', false) === true);
explicit.agentHub.other = 0;
check('new set to a falsy value still wins', cfg().get('other', 5) === 0);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-mig-'));
  const file = path.join(dir, 'export.json');
  const store = new Map();
  const gs = { get: (k, d) => (store.has(k) ? store.get(k) : d), update: async (k, v) => { store.set(k, v); } };
  check('no export file: nothing imported', (await importOldState(gs, file)) === 0);
  fs.writeFileSync(file, JSON.stringify({
    'claudeHelper.favourites': [{ id: 'a', path: '/x' }], 'claudeHelper.pinnedSessions': ['s1'],
  }));
  check('imports the keys present', (await importOldState(gs, file)) === 2 && gs.get('agentHub.favourites')[0].id === 'a'
    && gs.get('agentHub.pinnedSessions')[0] === 's1' && gs.get('agentHub.hiddenSessions') === undefined);
  store.set('agentHub.favourites', []);
  check('second run imports nothing and never overwrites', (await importOldState(gs, file)) === 0 && gs.get('agentHub.favourites').length === 0);
  process.exit(failed ? 1 : 0);
})();
