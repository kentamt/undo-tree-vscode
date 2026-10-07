// SPDX-License-Identifier: GPL-3.0-or-later
// Adapted from Toby Cubitt's undo-tree 0.8.2.
// Copyright (C) 2009-2021 Free Software Foundation, Inc.
// Source mappings and host differences: docs/PORTING.md.
'use strict';
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const hash = text => createHash('sha1').update(text, 'utf8').digest('hex');
function delta(before, after) {
  let start = 0, end = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (end < before.length - start && end < after.length - start && before[before.length - end - 1] === after[after.length - end - 1]) end++;
  return { offset: start, removed: before.slice(start, before.length - end), inserted: after.slice(start, after.length - end) };
}
function apply(text, { offset, removed, inserted }) {
  if (!Number.isInteger(offset) || offset < 0 || offset + removed.length > text.length || text.slice(offset, offset + removed.length) !== removed) throw new Error('Undo changeset does not match the document.');
  return text.slice(0, offset) + inserted + text.slice(offset + removed.length);
}
const invert = change => ({ offset: change.offset, removed: change.inserted, inserted: change.removed });
class History {
  constructor(text, { maxNodes = 200, groupDelay = 600, now = () => performance.timeOrigin + performance.now() } = {}) {
    this.maxNodes = Math.max(2, maxNodes); this.groupDelay = groupDelay; this.now = now;
    this.nextId = 0; this.nodes = new Map(); this.base = text; this.text = text;
    this.root = this.create(null, []); this.current = this.root; this.groupOpen = false;
  }
  // undo-tree-make-node; undo-list-transfer-to-tree pushes a new branch to the front.
  create(parent, redo) {
    const node = { id: this.nextId++, parent, children: [], branch: 0, undo: redo.slice().reverse().map(invert), redo,
      time: this.now(), saved: false, register: null };
    Object.defineProperties(node, { text: { get: () => this.materialize(node.id) }, preferred: { get: () => node.children[node.branch] || null } });
    this.nodes.set(node.id, node);
    if (parent) { parent.children.unshift(node); parent.branch = 0; }
    return node;
  }
  record(text, { boundary = false, changes } = {}) {
    if (text === this.text && !changes?.length) return this.current;
    const time = this.now();
    // VS Code range offsets refer to the pre-transaction document, so apply right to left.
    const edits = changes?.length ? changes.slice().sort((a, b) => b.rangeOffset - a.rangeOffset).map(c => ({
      offset: c.rangeOffset, removed: this.text.slice(c.rangeOffset, c.rangeOffset + c.rangeLength), inserted: c.text
    })) : [delta(this.text, text)];
    if (edits.reduce(apply, this.text) !== text) throw new Error('Edit event does not match the document.');
    if (!boundary && this.groupOpen && this.groupDelay > 0 && this.current !== this.root && !this.current.children.length &&
        !this.current.saved && !this.current.register && time - this.current.time < this.groupDelay) {
      this.current.redo.push(...edits); this.current.undo.unshift(...edits.slice().reverse().map(invert)); this.current.time = time;
    } else this.current = this.create(this.current, edits);
    this.text = text; this.groupOpen = !boundary; this.prune(); return this.current;
  }
  seal() { this.groupOpen = false; }
  undoTarget() { return this.current.parent; }
  redoTarget() { return this.current.children[this.current.branch]; }
  // undo-tree-switch-branch changes the redo route WITHOUT changing the buffer.
  switchBranch(branch) {
    if (this.current.children.length <= 1) throw new Error('Not at an undo branch point.');
    if (!Number.isInteger(branch) || branch < 0 || branch >= this.current.children.length) throw new Error('Invalid branch number.');
    this.current.branch = branch; this.seal();
  }
  // undo-tree-visualize-switch-branch-right/left clamp, rather than wrap.
  cycleBranch(amount) {
    if (!this.current.children.length) return;
    this.current.branch = Math.max(0, Math.min(this.current.children.length - 1, this.current.branch + amount)); this.seal();
  }
  // undo-tree-set finds the intersection, ascends by undo, then descends by redo.
  plan(id) {
    const node = this.nodes.get(id);
    if (!node) throw new Error('History state no longer exists.');
    const path = new Set();
    for (let n = node; n; n = n.parent) path.add(n);
    let intersection = this.current;
    const up = [], down = [];
    while (!path.has(intersection)) { up.push(intersection); intersection = intersection.parent; }
    for (let n = node; n !== intersection; n = n.parent) down.unshift(n);
    const changes = [...up.flatMap(n => n.undo), ...down.flatMap(n => n.redo)];
    return { node, intersection, up, down, changes, text: changes.reduce(apply, this.text) };
  }
  move(id, { preserveTimestamps = false } = {}) {
    const plan = this.plan(id);
    for (let child = plan.node; child.parent; child = child.parent) child.parent.branch = child.parent.children.indexOf(child);
    if (!preserveTimestamps) {
      for (const node of plan.up) node.parent.time = this.now();
      for (const node of plan.down) node.time = this.now();
    }
    this.current = plan.node; this.text = plan.text; this.seal(); return plan.node;
  }
  materialize(id) {
    const node = this.nodes.get(id);
    if (!node) throw new Error('History state no longer exists.');
    if (node === this.current) return this.text;
    const path = [];
    for (let n = node; n.parent; n = n.parent) path.unshift(n);
    return path.reduce((text, n) => n.redo.reduce(apply, text), this.base);
  }
  // undo-tree-visualize-undo-to-x / redo-to-x.
  branchPoint(direction, kind = 'branch', start = this.current) {
    let node = start;
    const next = n => direction === 'undo' ? n.parent : n.children[n.branch];
    while (next(node)) {
      node = next(node);
      if (((kind === 'branch' || kind === 'any') && node.children.length > 1) ||
          ((kind === 'saved' || kind === 'any') && node.saved) || ((kind === 'register' || kind === 'any') && node.register)) break;
    }
    return node;
  }
  markSaved() { for (const node of this.nodes.values()) node.saved = false; this.current.saved = true; this.seal(); }
  // undo-tree-oldest-leaf: descend into the oldest immediate child at each fork.
  oldestLeaf(node) {
    while (node.children.length) node = node.children.slice().sort((a, b) => a.time - b.time)[0];
    return node;
  }
  // undo-tree-discard-node, including current-node and final-undo protection.
  discardNode(node) {
    if (node === this.current) return null;
    if (node === this.root) {
      if (node.children.length > 1) throw new Error('Cannot discard a root with multiple branches.');
      const child = node.children[0];
      if (!child || child === this.current) return null;
      this.base = child.redo.reduce(apply, this.base); this.root = child;
      child.undo = []; child.redo = []; child.parent = null; this.nodes.delete(node.id);
      return child.children.length > 1 || child.children[0] === this.current ? this.oldestLeaf(child) : child;
    }
    if (node.children.length) throw new Error('Only a root or leaf can be discarded.');
    const parent = node.parent, active = parent.children[parent.branch];
    parent.children = parent.children.filter(child => child !== node);
    // Upstream can leave a nil index after deleting the active leaf. Use zero for a valid JS index.
    parent.branch = Math.max(0, parent.children.indexOf(active)); this.nodes.delete(node.id);
    return parent === this.current || (parent.children.length && (parent !== this.root || parent.children.length > 1)) ? this.oldestLeaf(parent) : parent;
  }
  prune() {
    let node = this.root.children.length > 1 ? this.oldestLeaf(this.root) : this.root;
    while (node && this.nodes.size > this.maxNodes) node = this.discardNode(node);
  }
  // undo-tree-node-compute-widths / undo-tree-compute-widths, iterative postorder.
  widths() {
    const widths = new Map(), stack = [[this.root, false]];
    while (stack.length) {
      const [node, ready] = stack.pop();
      if (!ready) { stack.push([node, true]); for (const child of node.children) stack.push([child, false]); continue; }
      const children = node.children.map(child => widths.get(child.id));
      const total = w => w[0] + w[1] + w[2], middle = Math.floor(children.length / 2);
      let left = 0, center = 0, right = 0;
      if (!children.length) center = 1;
      else if (children.length % 2) {
        left = children.slice(0, middle).reduce((sum, w) => sum + total(w), 0) + children[middle][0]; center = children[middle][1];
        right = children[middle][2] + children.slice(middle + 1).reduce((sum, w) => sum + total(w), 0);
      } else {
        left = children.slice(0, middle).reduce((sum, w) => sum + total(w), 0); right = children.slice(middle).reduce((sum, w) => sum + total(w), 0);
      }
      widths.set(node.id, [left, center, right]);
    }
    return widths;
  }
  serialize() {
    this.seal();
    return { format: 'vscode-undo-tree', version: 1, hash: hash(this.text), base: this.base, root: this.root.id, current: this.current.id, nextId: this.nextId,
      nodes: [...this.nodes.values()].map(n => ({ id: n.id, parent: n.parent?.id ?? null, children: n.children.map(child => child.id), branch: n.branch, redo: n.redo, time: n.time, saved: n.saved })) };
  }
  // Adapt undo-tree-save/load-history's version and buffer-hash guard to JSON.
  static deserialize(data, text, options) {
    if (data?.format !== 'vscode-undo-tree' || data.version !== 1) throw new Error('Unsupported undo history format.');
    if (data.hash !== hash(text)) throw new Error('The document has changed since this history was saved.');
    if (typeof data.base !== 'string' || !Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > 100000) throw new Error('Invalid undo history.');
    const history = new History(data.base, options); history.nodes.clear();
    let largestId = -1;
    for (const raw of data.nodes) {
      if (!Number.isSafeInteger(raw.id) || raw.id < 0 || history.nodes.has(raw.id) || !Array.isArray(raw.children) || !Array.isArray(raw.redo) || !Number.isFinite(raw.time) ||
          !Number.isInteger(raw.branch) || raw.branch < 0 || raw.branch >= Math.max(1, raw.children.length)) throw new Error('Invalid undo history node.');
      for (const edit of raw.redo) if (!Number.isInteger(edit.offset) || edit.offset < 0 || typeof edit.removed !== 'string' || typeof edit.inserted !== 'string') throw new Error('Invalid undo changeset.');
      history.nextId = raw.id;
      const node = history.create(null, raw.redo); node.time = raw.time; node.branch = raw.branch; node.saved = Boolean(raw.saved);
      largestId = Math.max(largestId, raw.id);
    }
    history.root = history.nodes.get(data.root); history.current = history.nodes.get(data.current);
    if (!history.root || !history.current || !Number.isSafeInteger(data.nextId) || data.nextId <= largestId) throw new Error('Invalid undo history root.');
    for (const raw of data.nodes) {
      const node = history.nodes.get(raw.id);
      node.children = raw.children.map(id => history.nodes.get(id)); node.parent = raw.parent === null ? null : history.nodes.get(raw.parent);
      if (node.children.some(child => !child) || (raw.parent !== null && !node.parent) || (node === history.root && (node.parent || node.redo.length))) throw new Error('Invalid undo history links.');
    }
    const seen = new Set(), stack = [[history.root, history.base]];
    let currentText;
    while (stack.length) {
      const [node, value] = stack.pop();
      if (seen.has(node)) throw new Error('Cyclic undo history.');
      seen.add(node); if (node === history.current) currentText = value;
      for (const child of node.children) {
        if (child.parent !== node) throw new Error('Invalid undo history parent.');
        stack.push([child, child.redo.reduce(apply, value)]);
      }
    }
    if (seen.size !== history.nodes.size || currentText !== text) throw new Error('Undo history does not match the document.');
    history.text = text; history.nextId = data.nextId; history.seal(); history.prune(); return history;
  }
}
module.exports = { History, delta, apply, invert, hash };
