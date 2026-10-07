// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { History } = require('../src/history');
const { Visualizer } = require('../src/visualizer');

test('multi-cursor transactions undo atomically and preserve Unicode and CRLF', () => {
  const before = '🙂alpha\r\nbeta\r\n', after = '🙂ALPHA\r\nBETA\r\n';
  const history = new History(before, { groupDelay: 0 });
  const edited = history.record(after, { changes: [
    { rangeOffset: 2, rangeLength: 5, text: 'ALPHA' }, { rangeOffset: 9, rangeLength: 4, text: 'BETA' }
  ] });
  history.move(history.root.id); assert.equal(history.text, before);
  history.move(edited.id); assert.equal(history.text, after);
});
test('arbitrary set traverses through the intersection and timestamps visited nodes', () => {
  let clock = 0;
  const history = new History('root', { now: () => ++clock, groupDelay: 0 });
  const a = history.record('a'), b = history.record('b');
  history.move(a.id); const c = history.record('c');
  const plan = history.plan(b.id), time = a.time;
  assert.equal(plan.intersection, a); assert.deepEqual(plan.up, [c]); assert.deepEqual(plan.down, [b]);
  history.move(b.id); assert.equal(history.text, 'b'); assert.ok(a.time > time); assert.ok(b.time > a.time);
  const timestamp = b.time;
  history.move(c.id, { preserveTimestamps: true }); history.move(b.id, { preserveTimestamps: true });
  assert.equal(b.time, timestamp);
});
test('branch selection never edits text, and visualizer direction clamps at each end', () => {
  const history = new History('', { groupDelay: 0 });
  const a = history.record('a'); history.record('first'); history.move(a.id); history.record('second'); history.move(a.id);
  history.switchBranch(1); assert.equal(history.text, 'a'); assert.equal(history.redoTarget().text, 'first');
  history.cycleBranch(20); assert.equal(history.current.branch, 1);
  history.cycleBranch(-20); assert.equal(history.current.branch, 0);
  assert.throws(() => history.switchBranch(2), /Invalid/);
});
test('selection mode and diff preview leave the buffer and timestamps unchanged', () => {
  const history = new History('', { groupDelay: 0 });
  const a = history.record('a'); history.record('first'); history.move(a.id); const b = history.record('second');
  const model = new Visualizer(history), original = history.serialize();
  model.toggleSelection(); model.select('up'); model.select('down'); model.select('right');
  assert.equal(history.materialize(model.diffTarget()), 'first');
  assert.deepEqual(history.serialize(), original);
  history.move(model.selected); assert.equal(history.text, 'first');
  history.move(model.initial); assert.equal(history.current, b); assert.equal(history.text, 'second');
});
test('source jump stops at saved states, registers and forks, and moves at least once', () => {
  const history = new History('', { groupDelay: 0 });
  history.root.saved = true;
  const a = history.record('a'); a.register = 'x';
  const b = history.record('b'); history.record('c');
  assert.equal(history.branchPoint('undo', 'any'), a);
  assert.equal(history.branchPoint('undo', 'branch'), history.root);
  history.move(a.id); assert.equal(history.branchPoint('undo', 'any'), history.root);
  assert.equal(history.branchPoint('redo', 'branch'), b.children[0]);
});
test('persistent history round-trips its branches and rejects stale or corrupt data', () => {
  const history = new History('🙂', { groupDelay: 0 });
  const a = history.record('🙂a'); history.record('🙂ab'); history.move(a.id); history.record('🙂ac'); history.move(a.id);
  history.switchBranch(1); history.markSaved();
  const data = JSON.parse(JSON.stringify(history.serialize()));
  const loaded = History.deserialize(data, history.text, { groupDelay: 0 });
  assert.deepEqual(loaded.serialize(), data);
  assert.equal(loaded.redoTarget().text, '🙂ab');
  loaded.move(loaded.redoTarget().id); assert.equal(loaded.text, '🙂ab');
  assert.throws(() => History.deserialize(data, 'modified'), /document has changed/);
  const badLink = structuredClone(data); badLink.nodes[0].children.push(badLink.root);
  assert.throws(() => History.deserialize(badLink, history.text), /Invalid|Cyclic/);
  const badEdit = structuredClone(data); badEdit.nodes[1].redo[0].removed = 'wrong';
  assert.throws(() => History.deserialize(badEdit, history.text), /does not match/);
});
test('small edits in a large file store changesets rather than full snapshots', () => {
  const base = 'x'.repeat(100000), history = new History(base, { groupDelay: 0 });
  for (let i = 1; i <= 100; i++) history.record(base + 'a'.repeat(i));
  const data = history.serialize();
  assert.ok(JSON.stringify(data).length < 140000);
  assert.ok(data.nodes.every(node => !Object.hasOwn(node, 'text')));
});
test('equal text does not collapse distinct transactional states', () => {
  const history = new History('same', { groupDelay: 0 });
  const same = history.record('same', { changes: [{ rangeOffset: 0, rangeLength: 4, text: 'same' }] });
  assert.notEqual(same, history.root);
  history.move(history.root.id); assert.equal(history.text, 'same');
  history.move(same.id); assert.equal(history.current, same);
});
