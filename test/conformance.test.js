// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { History } = require('../src/history');
const scenarios = require('./fixtures/scenarios.json');
const fixture = path.join(__dirname, 'fixtures/emacs-0.8.2.json');
function runPort(scenario) {
  let clock = 1000;
  const history = new History(scenario.initial, { groupDelay: 0, maxNodes: 2000, now: () => ++clock });
  const labels = new Map([['root', history.root]]), names = new Map([[history.root, 'root']]);
  function trace() {
    const widths = history.widths();
    return { text: history.text, root: names.get(history.root), current: names.get(history.current),
      nodes: [...history.nodes.values()].map(node => ({ name: names.get(node), parent: names.get(node.parent) || null,
        children: node.children.map(child => names.get(child)), branch: node.branch, widths: widths.get(node.id)
      })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0) };
  }
  const traces = [trace()];
  for (const op of scenario.ops) {
    if (op.type === 'edit') {
      const node = history.record(op.text, { changes: [{ rangeOffset: 0, rangeLength: history.text.length, text: op.text }] });
      labels.set(op.name, node); names.set(node, op.name);
    }
    if (op.type === 'undo') history.move(history.undoTarget().id);
    if (op.type === 'redo') history.move(history.redoTarget().id);
    if (op.type === 'switch') history.switchBranch(op.branch);
    if (op.type === 'set') history.move(labels.get(op.name).id);
    if (op.type === 'discard') history.discardNode(labels.get(op.name));
    traces.push(trace());
  }
  return { name: scenario.name, traces };
}
const emacsAvailable = spawnSync('emacs', ['--batch', '-Q', '--eval', '(princ emacs-version)'], { timeout: 10000 }).status === 0;
function oracle() {
  return JSON.parse(execFileSync('emacs', ['--batch', '-Q', '-L', path.join(__dirname, '../upstream/undo-tree'),
    '--load', path.join(__dirname, 'oracle.el'), path.join(__dirname, 'fixtures/scenarios.json')], { encoding: 'utf8', timeout: 30000 }));
}
if (process.env.UPDATE_EMACS_FIXTURES === '1') fs.writeFileSync(fixture, JSON.stringify(oracle(), null, 2) + '\n');
test('ported operations match committed traces from unmodified Emacs undo-tree 0.8.2', () => {
  assert.deepEqual(scenarios.map(runPort), JSON.parse(fs.readFileSync(fixture, 'utf8')));
});
test('ported operations match a live Emacs run of the upstream source', { skip: !emacsAvailable }, () => {
  assert.deepEqual(scenarios.map(runPort), oracle());
});
