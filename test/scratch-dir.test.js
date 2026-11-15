#!/usr/bin/env node
// A session with no client goes to ~/tasks/<slug>, not ~/tasks/<slug>/<slug>
// (Pat, 2026-11-15: "test it" proposed ../tasks/test_it/test_it).
// Run: node test/scratch-dir.test.js
const Module = require('module'), path = require('path'), os = require('os');
const vscode = new Proxy({}, { get: (t, k) => (k === 'workspace' ? { getConfiguration: () => ({ get: (a, d) => d }) } : class {}) });
const origLoad = Module._load;
Module._load = function (req) { if (req === 'vscode') return vscode; return origLoad.apply(this, arguments); };
const { scratchTarget, targetDir } = require('../lib/newtask');

let failed = 0;
const check = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}`); if (!c) failed++; };
const want = path.join(os.homedir(), 'tasks', 'test_it');
check('no-client target gets the slug once', targetDir(scratchTarget(), 'test_it') === want);
check('no target at all gets the slug once', targetDir(null, 'test_it') === want);
process.exit(failed ? 1 : 0);
