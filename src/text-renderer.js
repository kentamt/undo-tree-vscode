// SPDX-License-Identifier: GPL-3.0-or-later
// Port of undo-tree-draw-node, draw-subtree, node-char-lwidth/rwidth and timestamp-to-string.
// Original: Toby Cubitt, undo-tree 0.8.2; Copyright (C) 2009-2021 Free Software Foundation, Inc.
'use strict';

function timestampString(time, { now = Date.now(), relative = true, current = false, register = null } = {}) {
  const suffix = register ? `[${register}]` : '   ';
  if (!relative) {
    const date = new Date(time), two = n => String(n).padStart(2, '0');
    return `${current ? ' *' : '  '}${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}${suffix}`;
  }
  let seconds = Math.max(0, Math.floor((now - time) / 1000)), age;
  // Preserve upstream's literal year divisor, including its unusual ten-year unit.
  const years = Math.floor(seconds / 315360000);
  if (years > 0) age = years > 999 ? '-ages' : `-${years}y`;
  else {
    seconds %= 315360000;
    for (const [unit, divisor] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]) {
      const count = Math.floor(seconds / divisor);
      if (count > 0 || unit === 's') { age = `-${count}${unit}`; break; }
      seconds %= divisor;
    }
  }
  return `${current ? '*' : ' '}${age}${suffix}`.padStart(9, ' ');
}

function renderText(history, { timestamps = false, relativeTimestamps = true, now = Date.now() } = {}) {
  const spacing = timestamps ? relativeTimestamps ? 9 : 13 : 3;
  const half = Math.floor(spacing / 2), widths = history.widths();
  const left = node => node.children.length ? (spacing + 1) * widths.get(node.id)[0] - (widths.get(node.id)[1] === 0 ? half + 1 : 0) : 0;
  const right = node => node.children.length ? (spacing + 1) * widths.get(node.id)[2] - (widths.get(node.id)[1] === 0 ? half + 1 : 0) : 0;
  const grid = [], positions = new Map(), activeNodes = new Set();
  for (let node = history.root; node; node = node.children[node.branch]) activeNodes.add(node.id);
  function put(row, column, text, active = false, id) {
    grid[row] ||= [];
    for (const char of text) grid[row][column++] = { text: char, active, id };
  }
  function drawNode(node, row, column) {
    const current = node === history.current;
    const label = timestamps ? timestampString(node.time, { now, relative: relativeTimestamps, current, register: node.register })
      : node.register || (node.saved ? 's' : current ? 'x' : 'o');
    put(row, column - (timestamps ? half : 0), label, activeNodes.has(node.id), node.id);
    positions.set(node.id, { id: node.id, row, column });
  }
  function connector(node, child, row, column, childColumn, active) {
    if (node.children.length === 1) {
      put(row + 1, column, '|', active); put(row + 2, column, '|', active);
      return;
    }
    put(row + 1, column, '|', active);
    const index = node.children.indexOf(child), middle = Math.floor(node.children.length / 2);
    if (index < middle) {
      put(row + 1, childColumn + 2, '_'.repeat(Math.max(0, column - childColumn - 2)), active);
      put(row + 2, childColumn + 1, '/', active);
    } else if (node.children.length % 2 && index === middle) put(row + 2, childColumn, '|', active);
    else {
      put(row + 1, column + 1, '_'.repeat(Math.max(0, childColumn - column - 2)), active);
      put(row + 2, childColumn - 1, '\\', active);
    }
  }
  // The source reserves two connector rows between node rows. Character widths,
  // unlike SVG widths, include the centre gap correction for an even number of children.
  const stack = [[history.root, 0, left(history.root) + (timestamps ? half : 0) + 2]];
  while (stack.length) {
    const [node, row, column] = stack.pop(); drawNode(node, row, column);
    let childColumn = node.children.length === 1 ? column : column - left(node) + (node.children[0] ? left(node.children[0]) : 0);
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      connector(node, child, row, column, childColumn, false);
      stack.push([child, row + 3, childColumn]);
      const next = node.children[i + 1];
      if (next) childColumn += right(child) + left(next) + spacing + 1;
    }
  }
  // Source highlight-active-branch redraws the selected route over the full tree.
  for (let node = history.root; node?.children[node.branch]; node = node.children[node.branch]) {
    const child = node.children[node.branch], p = positions.get(node.id), c = positions.get(child.id);
    connector(node, child, p.row, p.column, c.column, true);
  }
  // Strip viewport-dependent horizontal margins, retaining internal spacing exactly.
  let margin = Infinity;
  for (const row of grid) {
    const start = row.findIndex(cell => cell?.text !== undefined && cell.text !== ' ');
    if (start >= 0) margin = Math.min(margin, start);
  }
  if (!Number.isFinite(margin)) margin = 0;
  const rows = grid.map(row => {
    let end = row.length;
    while (end > margin && (!row[end - 1] || row[end - 1].text === ' ')) end--;
    const runs = [];
    for (let column = margin; column < end; column++) {
      const cell = row[column] || { text: ' ', active: false };
      const last = runs.at(-1);
      if (last && last.id === cell.id && last.active === cell.active) last.text += cell.text;
      else runs.push({ ...cell });
    }
    return runs;
  });
  return { text: rows.map(row => row.map(run => run.text).join('')).join('\n'), rows,
    positions: [...positions.values()].map(p => ({ ...p, column: p.column - margin })) };
}
module.exports = { renderText, timestampString };
