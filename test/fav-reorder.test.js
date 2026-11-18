#!/usr/bin/env node
// Tests reorderFavs — dragging a favourite onto another takes the target's place:
// dragged down it lands after the target, dragged up before it, on empty space last.
//
// Run: node test/fav-reorder.test.js
const Module = require('module'), assert = require('assert');
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? {} : origLoad.call(this, req, ...rest); };
const { reorderFavs } = require('../lib/favourites');

const favs = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
const ids = (l) => l && l.map((f) => f.id).join('');

assert.strictEqual(ids(reorderFavs(favs, ['a'], 'c')), 'bcad', 'down: after target');
assert.strictEqual(ids(reorderFavs(favs, ['d'], 'b')), 'adbc', 'up: before target');
assert.strictEqual(ids(reorderFavs(favs, ['b'], undefined)), 'acdb', 'empty space: last');
assert.strictEqual(reorderFavs(favs, ['b'], 'b'), null, 'onto itself: no change');
assert.strictEqual(reorderFavs(favs, ['x'], 'a'), null, 'unknown id: no change');
assert.strictEqual(ids(favs), 'abcd', 'input untouched');
console.log('ok');
