// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { History } = require('../src/history');

test('editing after undo preserves both redo branches', () => {
  const history = new History('A', { groupDelay: 0 });
  const b = history.record('AB');
  const c = history.record('ABC');
  history.move(b.id);
  const d = history.record('ABD');
  assert.deepEqual(b.children.map(node => node.text), ['ABD', 'ABC']);
  history.move(b.id);
  assert.equal(history.redoTarget(), d);
  history.move(c.id);
  history.move(b.id);
  assert.equal(history.redoTarget(), c);
});

test('typing groups stop at navigation, timeout, explicit boundary and save', () => {
  let time = 0;
  const history = new History('', { now: () => time, groupDelay: 600 });
  const first = history.record('a');
  time = 100;
  assert.equal(history.record('ab'), first);
  time = 800;
  const second = history.record('abc');
  assert.notEqual(second, first);
  history.move(first.id);
  const branch = history.record('abd');
  assert.notEqual(branch, first);
  assert.equal(first.text, 'ab');
  history.seal();
  assert.notEqual(history.record('abde'), branch);
  const boundary = history.record('abdef', { boundary: true });
  assert.notEqual(history.record('abdefg'), boundary);
});

function verify(history) {
  const visited = new Set();
  function walk(node) {
    assert.ok(!visited.has(node));
    visited.add(node);
    assert.equal(history.nodes.get(node.id), node);
    if (node.preferred) assert.ok(node.children.includes(node.preferred));
    for (const child of node.children) {
      assert.equal(child.parent, node);
      walk(child);
    }
  }
  walk(history.root);
  assert.equal(history.root.parent, null);
  assert.equal(visited.size, history.nodes.size);
  assert.ok(visited.has(history.current));
  assert.ok(history.nodes.size <= history.maxNodes);
}

test('source pruning first advances a single-child root, then discards old branches', () => {
  let clock = 0;
  const history = new History('A', { maxNodes: 4, groupDelay: 0, now: () => ++clock });
  const b = history.record('B');
  const c = history.record('C');
  history.move(b.id);
  history.record('D');
  history.record('E');
  assert.ok(history.nodes.has(c.id));
  assert.equal(history.root.text, 'B');
  verify(history);
  history.record('F');
  assert.ok(!history.nodes.has(c.id));
  verify(history);
});

test('repeated branching and pruning preserves reachable nodes and redo pointers', () => {
  let clock = 0;
  const history = new History('', { maxNodes: 12, groupDelay: 0, now: () => ++clock });
  for (let i = 0; i < 300; i++) {
    if (i % 3 === 0 && history.undoTarget()) history.move(history.undoTarget().id);
    if (i % 7 === 0) history.move(history.root.id);
    history.record(`state ${i}`);
    verify(history);
  }
});

test('identical edits do not create nodes; expired nodes reject navigation', () => {
  const history = new History('A', { maxNodes: 2, groupDelay: 0 });
  assert.equal(history.record('A'), history.root);
  history.record('B');
  history.record('C');
  assert.throws(() => history.move(0), /no longer exists/);
  verify(history);
});
