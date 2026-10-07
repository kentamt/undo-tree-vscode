// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const vscode = acquireVsCodeApi();
const ns = 'http://www.w3.org/2000/svg';
let state;
const send = (action, extra = {}) => vscode.postMessage({ action, ...extra });
function attributes(node, attrs, text) {
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function element(tag, attrs = {}, text) { return attributes(document.createElementNS(ns, tag), attrs, text); }
const nodeClasses = node => ['current', 'active', 'saved', 'selected', 'register'].filter(key => node[key]).join(' ');
const nodeLabel = node => `State ${node.id}${node.current ? ', current' : ''}${node.saved ? ', saved' : ''}${node.register ? ', register ' + node.register : ''}`;
function bindNode(target, node) {
  attributes(target, { tabindex: '0', role: 'treeitem', 'aria-label': nodeLabel(node), 'aria-selected': node.selected || node.current, 'data-id': node.id });
  target.addEventListener('click', () => {
    // Dragging to copy the text tree must not restore a historical document state.
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) return;
    target.focus({ preventScroll: true }); send('node', { id: node.id });
  });
  target.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation(); send('node', { id: node.id });
      if (event.key === 'Enter' && state.selectionMode) send('set');
    }
  });
}
function drawGraphical(data) {
  const spacing = data.timestamps ? 170 : 75, step = 65;
  const svg = element('svg', { width: Math.max(400, data.columns * spacing + 80), height: (data.depth + 1) * step + 40, role: 'tree', 'aria-label': 'Undo history' });
  const px = x => x * spacing + 40, py = y => y * step + 25;
  for (const edge of data.edges) {
    const x1 = px(edge.x1), x2 = px(edge.x2), y1 = py(edge.y1), y2 = py(edge.y2);
    svg.append(element('path', { d: `M${x1},${y1 + 9} V${y1 + 25} H${x2} V${y2 - 9}`, class: edge.active ? 'active' : '' }));
  }
  for (const node of data.nodes) {
    const group = element('g', { transform: `translate(${px(node.x)},${py(node.depth)})`, class: nodeClasses(node) });
    bindNode(group, node);
    group.append(element('title', {}, `${nodeLabel(node)} · ${new Date(node.time).toLocaleString()}`));
    group.append(element('circle', { r: 9 }));
    group.append(element('text', { x: 14, y: 4 }, data.timestamps ? new Date(node.time).toLocaleTimeString() : node.register || `#${node.id}`));
    svg.append(group);
  }
  return svg;
}
function drawText(data) {
  const pre = attributes(document.createElement('pre'), { class: 'text-tree', role: 'tree', 'aria-label': 'Emacs-style undo history' });
  const nodes = new Map(data.nodes.map(node => [node.id, node]));
  data.textTree.rows.forEach((row, index) => {
    if (index) pre.append(document.createTextNode('\n'));
    for (const run of row) {
      const span = document.createElement('span');
      span.textContent = run.text;
      if (run.id !== undefined) {
        const node = nodes.get(run.id);
        span.className = `text-node ${nodeClasses(node)}`;
        span.title = `${nodeLabel(node)} · ${new Date(node.time).toLocaleString()}`;
        bindNode(span, node);
      } else span.className = `text-branch${run.active ? ' active' : ''}`;
      pre.append(span);
    }
  });
  return pre;
}
function draw(data) {
  const previous = state;
  state = data;
  const content = data.style === 'text' ? drawText(data) : drawGraphical(data);
  const tree = document.getElementById('tree'), focusId = document.activeElement?.getAttribute('data-id');
  tree.replaceChildren(content);
  const moved = !previous || previous.current !== data.current || previous.selected !== data.selected || previous.selectionMode !== data.selectionMode || previous.style !== data.style;
  const point = data.selectionMode ? data.selected : data.current;
  // Point follows tree navigation, so Enter operates on the node just reached.
  const nextFocus = moved ? point : (focusId == null ? undefined : Number(focusId));
  if (nextFocus !== undefined) content.querySelector(`[data-id="${nextFocus}"]`)?.focus({ preventScroll: true });
  // Emacs keeps point visible. Bring the current/selected text node into view on movement.
  if (data.style === 'text' && (previous?.style !== 'text' || previous.current !== data.current || previous.selected !== data.selected || previous.timestamps !== data.timestamps)) {
    content.querySelector(`[data-id="${data.selectionMode ? data.selected : data.current}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  document.getElementById('status').textContent = `${data.style === 'text' ? 'Text (o: state, x: current, s: saved)' : 'Graphical'} · Keys: ${data.keybindings === 'emacs' ? 'Emacs (C-p/n/b/f, C-v/M-v; M = Alt)' : 'Standard'} · Current: #${data.current} · ${data.nodes.length} states · ${data.selectionMode ? 'Selection mode: moves leave the file unchanged; Enter restores.' : 'Navigation mode: Up/Down restore states; Left/Right choose the redo branch.'}`;
  for (const [action, value] of [['style', data.style === 'text'], ['keybindings', data.keybindings === 'emacs'], ['selection', data.selectionMode], ['timestamps', data.timestamps], ['diff', data.diff]]) {
    document.querySelector(`[data-action="${action}"]`).setAttribute('aria-pressed', String(value));
  }
}
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
  send(button.dataset.action);
  // Mouse use of the toolbar should not interrupt the tree's keyboard navigation.
  button.blur(); document.getElementById('tree').focus({ preventScroll: true });
}));
function scroll(action) {
  if (action === 'pageUp' || action === 'pageDown') window.scrollBy({ top: window.innerHeight * 0.8 * (action === 'pageUp' ? -1 : 1) });
  if (action === 'scrollLeft' || action === 'scrollRight') document.getElementById('tree').scrollBy({ left: 200 * (action === 'scrollLeft' ? -1 : 1) });
}
window.addEventListener('message', event => {
  if (event.data?.type === 'state') draw(event.data.state);
  if (event.data?.type === 'scroll') scroll(event.data.action);
});
window.addEventListener('keydown', event => {
  // Modified Emacs keys are routed exclusively by contributed VS Code bindings.
  // VS Code forwards DOM keydown events even after preventDefault; handling them
  // here as well would navigate twice and also run workbench shortcuts.
  if (state?.keybindings === 'emacs' && (event.ctrlKey || event.altKey || event.metaKey)) return;
  if (event.target instanceof HTMLButtonElement || event.altKey || event.metaKey || event.isComposing) return;
  if (!event.ctrlKey && !state?.selectionMode && ['PageUp', 'PageDown'].includes(event.key)) {
    event.preventDefault(); window.scrollBy({ top: window.innerHeight * 0.8 * (event.key === 'PageUp' ? -1 : 1) }); return;
  }
  let action;
  if (event.ctrlKey && event.key.toLowerCase() === 'q') action = 'abort';
  else if (event.ctrlKey && event.key === 'ArrowUp') action = 'undoBranch';
  else if (event.ctrlKey && event.key === 'ArrowDown') action = 'redoBranch';
  else if (event.ctrlKey) action = ({ p: 'up', n: 'down', b: 'left', f: 'right' })[event.key];
  else action = ({ ArrowUp: 'up', p: 'up', ArrowDown: 'down', n: 'down', ArrowLeft: 'left', b: 'left', ArrowRight: 'right', f: 'right',
    v: 'style', s: 'selection', t: 'timestamps', d: 'diff', q: 'quit', Enter: 'set', PageUp: 'pageUp', PageDown: 'pageDown' })[event.key];
  if (state?.keybindings === 'emacs' && !event.ctrlKey) {
    if ([',', '<'].includes(event.key)) action = 'scrollLeft';
    if (['.', '>'].includes(event.key)) action = 'scrollRight';
  }
  if (action) { event.preventDefault(); send(action); }
});
send('ready');
