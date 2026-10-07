// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { History } = require('../src/history');
const { renderText, timestampString } = require('../src/text-renderer');
process.env.TZ = 'UTC';
const scenarios = require('./fixtures/text-scenarios.json');
const fixture = path.join(__dirname, 'fixtures/emacs-text-0.8.2.json');
function model(scenario) {
  const nodes = new Map(scenario.nodes.map(raw => [raw.id, { ...raw, parent: null }]));
  for (const node of nodes.values()) {
    node.children = node.children.map(id => nodes.get(id));
    for (const child of node.children) child.parent = node;
  }
  return { nodes, root: nodes.get(scenario.root), current: nodes.get(scenario.current), widths: History.prototype.widths };
}
function runPort(scenario) {
  const rendered = renderText(model(scenario), scenario);
  return { name: scenario.name, text: rendered.text, positions: rendered.positions.sort((a, b) => a.id - b.id) };
}
const emacsAvailable = spawnSync('emacs', ['--batch', '-Q', '--eval', '(princ emacs-version)'], { timeout: 10000 }).status === 0;
function oracle() {
  return JSON.parse(execFileSync('emacs', ['--batch', '-Q', '-L', path.join(__dirname, '../upstream/undo-tree'),
    '--load', path.join(__dirname, 'text-oracle.el'), path.join(__dirname, 'fixtures/text-scenarios.json')],
  { encoding: 'utf8', timeout: 30000, env: { ...process.env, TZ: 'UTC' } }));
}
if (process.env.UPDATE_EMACS_FIXTURES === '1') fs.writeFileSync(fixture, JSON.stringify(oracle(), null, 2) + '\n');
test('text and node positions match actual Emacs drawing fixtures', () => {
  const expected = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  for (const [index, scenario] of scenarios.entries()) assert.deepEqual(runPort(scenario), expected[index], scenario.name);
});
test('text and node positions match a live run of unmodified Emacs drawing', { skip: !emacsAvailable }, () => {
  const expected = oracle();
  for (const [index, scenario] of scenarios.entries()) assert.deepEqual(runPort(scenario), expected[index], scenario.name);
});
test('text tokens preserve node hit targets and highlight the active redo branch', () => {
  const history = model(scenarios.find(scenario => scenario.name === 'nested-even'));
  const rendered = renderText(history), ids = new Set(rendered.rows.flatMap(row => row.filter(run => run.id !== undefined).map(run => run.id)));
  assert.deepEqual([...ids].sort((a, b) => a - b), [...history.nodes.keys()].sort((a, b) => a - b));
  assert.equal(rendered.rows.map(row => row.map(run => run.text).join('')).join('\n'), rendered.text);
  assert.ok(rendered.rows.flat().some(run => run.active && run.text.includes('|')));
  assert.ok(rendered.rows.flat().some(run => !run.active && run.text.includes('\\')));
});
test('symbols follow the original register, saved, current, ordinary precedence', () => {
  const history = new History('', { groupDelay: 0 });
  assert.equal(renderText(history).text, 'x');
  history.current.saved = true; assert.equal(renderText(history).text, 's');
  history.current.register = 'a'; assert.equal(renderText(history).text, 'a');
  history.current.saved = false; history.current.register = null;
  history.record('edited'); assert.equal(renderText(history).text, 'o\n|\n|\nx');
});
test('source relative timestamp formatting preserves fixed-width current/register labels', () => {
  const now = 1700000000000;
  assert.equal(timestampString(now, { now, current: true }), '  *-0s   ');
  assert.equal(timestampString(now - 61000, { now, register: 'a' }), '   -1m[a]');
  assert.equal(timestampString(now - 86400000, { now, current: true, register: 'a' }), '  *-1d[a]');
});
