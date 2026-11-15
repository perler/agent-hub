#!/usr/bin/env node
// A bare entry is looked up as a pasted mail subject (Pat, 2026-11-15), but only a mail
// whose subject holds the whole entry counts, so a question never picks up a mail that
// merely shares words with it.
// Run: node test/pasted-mail.test.js
const Module = require('module');
const vscode = new Proxy({}, { get: (t, k) => (k === 'workspace' ? { getConfiguration: () => ({ get: (a, d) => d }) } : class {}) });
const origLoad = Module._load;
Module._load = function (req) { if (req === 'vscode') return vscode; return origLoad.apply(this, arguments); };
const { pastedSubjectMatches: p } = require('../lib/newtask');

let failed = 0;
const check = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}`); if (!c) failed++; };
check('reply prefix on the mail is ignored', p('Druckerproblem', { subject: 'AW: Druckerproblem' }));
check('reply prefix on the entry is ignored', p('Re:  Access to servers', { subject: 'RE: Access to servers' }));
check('shared words are not a match', !p('lets do the weekly billing', { subject: 'Weekly billing report' }));
check('short entries never match', !p('ebay sale', { subject: 'ebay sale 123' }));
check('no mail, no match', !p('Druckerproblem', null));
const amazon = { subject: 'Bestellt: „Insta360 Link 2C...“' };
check('shortened subject pasted as is', p('Bestellt: „Insta360 Link 2C...“', amazon));
check('… and ... are the same ellipsis', p('Bestellt: „Insta360 Link 2C…“', amazon));
check('Gmail cut a longer subject', p('Bestellt: „Insta360 Link 2C…', { subject: 'Bestellt: „Insta360 Link 2C Webcam“' }));
process.exit(failed ? 1 : 0);
