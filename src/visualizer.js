// SPDX-License-Identifier: GPL-3.0-or-later
// Adapted from undo-tree-visualizer-mode and its selection/navigation commands.
'use strict';
const { renderText } = require('./text-renderer');
class Visualizer {
  constructor(history, { style = 'graphical', keybindings = 'standard' } = {}) {
    history.seal(); this.history = history; this.initial = history.current.id;
    this.selected = history.current.id; this.selectionMode = false; this.timestamps = false; this.diff = false;
    this.style = style; this.keybindings = keybindings;
  }
  toggleSelection() { this.selectionMode = !this.selectionMode; this.selected = this.history.current.id; }
  select(direction, count = 1) {
    let node = this.history.nodes.get(this.selected) || this.history.current;
    for (let i = 0; i < count; i++) {
      if (direction === 'up') node = node.parent || node;
      if (direction === 'down') node = node.children[node.branch] || node;
      if (direction === 'left' || direction === 'right') {
        // Emacs scans a whole display row, including cousins (not just siblings).
        const rows = this.layout().nodes.filter(n => n.depth === this.depth(node)).sort((a, b) => a.x - b.x);
        const index = rows.findIndex(n => n.id === node.id);
        const target = rows[index + (direction === 'right' ? 1 : -1)];
        if (target) node = this.history.nodes.get(target.id);
      }
    }
    this.selected = node.id;
  }
  depth(node) { let depth = 0; for (; node.parent; node = node.parent) depth++; return depth; }
  diffTarget() {
    return this.selectionMode ? this.selected : (this.history.current.parent || this.history.current).id;
  }
  layout() {
    const history = this.history, widths = history.widths();
    const active = new Set();
    for (let node = history.root; node; node = node.children[node.branch]) active.add(node.id);
    const nodes = [], edges = [], stack = [[history.root, 0, 0]];
    let maxDepth = 0;
    while (stack.length) {
      const [node, start, depth] = stack.pop();
      const [left, center] = widths.get(node.id);
      const x = start + left + center / 2;
      nodes.push({ id: node.id, x, depth, time: node.time, current: node === history.current,
        selected: this.selectionMode && node.id === this.selected, active: active.has(node.id), saved: node.saved, register: node.register });
      maxDepth = Math.max(depth, maxDepth);
      let childStart = start;
      for (const child of node.children) {
        const w = widths.get(child.id), childX = childStart + w[0] + w[1] / 2;
        edges.push({ from: node.id, to: child.id, x1: x, y1: depth, x2: childX, y2: depth + 1, active: active.has(node.id) && child === node.children[node.branch] });
        stack.push([child, childStart, depth + 1]); childStart += w[0] + w[1] + w[2];
      }
    }
    return { current: history.current.id, selected: this.selected, selectionMode: this.selectionMode, timestamps: this.timestamps, diff: this.diff,
      style: this.style, keybindings: this.keybindings, ...(this.style === 'text' ? { textTree: renderText(history, { timestamps: this.timestamps }) } : {}),
      columns: widths.get(history.root.id).reduce((sum, value) => sum + value, 0), depth: maxDepth, nodes, edges };
  }
}
module.exports = { Visualizer };
