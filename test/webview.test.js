// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { History } = require('../src/history');
const { Visualizer } = require('../src/visualizer');

test('webview renders selectable literal text and retains keyboard navigation across mode switches', () => {
  // Small DOM harness executes the actual webview script. This is not a browser/CSS test.
  const messages = [], scrolls = [], windowEvents = new Map();
  let selectionCollapsed = true;
  let document;
  class Element {
    constructor(tag) { this.tag = tag; this.attrs = new Map(); this.children = []; this.events = new Map(); this.dataset = {}; this.value = ''; }
    get textContent() { return this.value + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.value = value; this.children = []; }
    setAttribute(key, value) { this.attrs.set(key, value); if (key === 'data-action') this.dataset.action = value; }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, listener) { this.events.set(name, listener); }
    emit(name, event = {}) { this.events.get(name)?.(event); }
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) document.activeElement = null; }
    scrollBy(options) { scrolls.push(options); }
    scrollIntoView() { this.scrolled = true; }
    querySelector(selector) {
      const match = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
      for (const child of this.children) {
        if (match && child.getAttribute(match[1]) === match[2]) return child;
        const found = child.querySelector(selector); if (found) return found;
      }
      return null;
    }
  }
  class Button extends Element {}
  const tree = new Element('main'), status = new Element('div');
  const buttons = ['style', 'up', 'down', 'selection', 'timestamps', 'diff', 'keybindings'].map(action => {
    const button = new Button('button'); button.setAttribute('data-action', action); return button;
  });
  document = { activeElement: null, createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; },
    getElementById: id => id === 'tree' ? tree : status,
    querySelectorAll: () => buttons,
    querySelector: selector => buttons.find(button => selector === `[data-action="${button.dataset.action}"]`)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../media/visualizer.js'), 'utf8'), {
    document, HTMLButtonElement: Button, acquireVsCodeApi: () => ({ postMessage: message => messages.push(message) }),
    window: { addEventListener: (name, listener) => windowEvents.set(name, listener), scrollBy(options) { scrolls.push(options); }, innerHeight: 600,
      getSelection: () => ({ isCollapsed: selectionCollapsed }) }
  });
  const history = new History('', { groupDelay: 0 }); history.record('a'); history.record('ab');
  const model = new Visualizer(history, { style: 'text' });
  const publish = () => windowEvents.get('message')({ data: { type: 'state', state: model.layout() } });
  publish();
  assert.equal(tree.children[0].tag, 'pre'); assert.equal(tree.textContent, model.layout().textTree.text);
  const current = tree.querySelector(`[data-id="${history.current.id}"]`);
  assert.ok(current.scrolled); current.emit('click');
  assert.equal(messages.at(-1).action, 'node'); assert.equal(messages.at(-1).id, history.current.id);
  selectionCollapsed = false;
  const count = messages.length; current.emit('click');
  assert.equal(messages.length, count, 'selecting text for copying must not restore a historical state');
  selectionCollapsed = true;
  windowEvents.get('keydown')({ target: current, key: 'ArrowUp', preventDefault() {} });
  assert.equal(messages.at(-1).action, 'up');
  history.move(history.undoTarget().id); publish();
  assert.equal(document.activeElement.getAttribute('data-id'), String(history.current.id), 'focus must follow the state reached, rather than leave Enter pointing at the old node');
  model.toggleSelection(); model.select('up'); publish();
  const selected = tree.querySelector(`[data-id="${model.selected}"]`);
  selected.emit('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(messages.slice(-2).map(message => message.action), ['node', 'set']);
  const styleButton = buttons[0]; styleButton.focus(); styleButton.emit('click');
  assert.equal(messages.at(-1).action, 'style'); assert.equal(document.activeElement, tree);
  model.style = 'graphical'; publish(); assert.equal(tree.children[0].tag, 'svg');
  assert.equal(styleButton.getAttribute('aria-pressed'), 'false');
  model.style = 'text'; publish(); assert.equal(tree.children[0].tag, 'pre');
  assert.equal(styleButton.getAttribute('aria-pressed'), 'true');
  model.keybindings = 'emacs'; publish();
  assert.equal(buttons.at(-1).getAttribute('aria-pressed'), 'true');
  assert.match(status.textContent, /Keys: Emacs/);
  for (const [key, modifiers] of [['p', { ctrlKey: true }], ['n', { ctrlKey: true }], ['b', { ctrlKey: true }], ['f', { ctrlKey: true }], ['v', { ctrlKey: true }], ['v', { altKey: true }], ['{', { altKey: true, shiftKey: true }]]) {
    const before = messages.length;
    windowEvents.get('keydown')({ target: tree, key, ...modifiers, preventDefault() { throw new Error('Host keys must be forwarded to VS Code'); } });
    assert.equal(messages.length, before, 'host bindings must be the only dispatch path for modified Emacs keys');
  }
  windowEvents.get('keydown')({ target: tree, key: ',', preventDefault() {} });
  assert.equal(messages.at(-1).action, 'scrollLeft');
  windowEvents.get('message')({ data: { type: 'scroll', action: 'scrollRight' } });
  assert.equal(scrolls.at(-1).left, 200);
  windowEvents.get('message')({ data: { type: 'scroll', action: 'pageDown' } });
  assert.equal(scrolls.at(-1).top, 480);

});
