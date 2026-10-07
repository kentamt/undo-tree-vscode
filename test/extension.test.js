// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('extension integrates branching history, persistence and a visible focused visualizer', async () => {
  const handlers = {};
  const commands = new Map();
  const disposable = { dispose() {} };
  const listen = name => callback => { handlers[name] = callback; return disposable; };
  class Uri {
    constructor(value) { this.value = value; this.scheme = value.split(':')[0]; this.path = value.slice(value.indexOf(':') + 1); }
    toString() { return this.value; }
    static parse(value) { return new Uri(value); }
    static from({ scheme, path, query }) { return new Uri(`${scheme}:${path}?${query}`); }
    static joinPath(uri, ...parts) { return new Uri(uri.toString() + '/' + parts.join('/')); }
  }
  let text = 'A';
  let acceptEdits = true;
  let afterEdit;
  const document = { uri: Uri.parse('file:/example.txt'), getText: () => text, offsetAt: value => value, positionAt: value => Math.min(value, text.length) };
  function editText(value, reason) {
    const before = text;
    text = value;
    handlers.change({ document, contentChanges: [{ rangeOffset: 0, rangeLength: before.length, text: value }], reason });
  }
  const editor = {
    document, viewColumn: 1, selections: [{ anchor: 0, active: 0 }],
    async edit(callback) {
      if (!acceptEdits) return false;
      callback({ replace: (range, value) => editText(text.slice(0, range.start) + value + text.slice(range.end)) });
      afterEdit?.();
      return true;
    }
  };
  let provider;
  let diffUri;
  let panel, visualState, activeColumn = 1, diffOptions;
  function showInColumn(column, preserveFocus) {
    const target = column === api.ViewColumn.Beside ? activeColumn + 1 : column ?? activeColumn;
    if (!api.window.tabGroups.all.some(group => group.viewColumn === target)) api.window.tabGroups.all.push({ viewColumn: target, tabs: [] });
    if (panel && !panel.closed && target === panel.viewColumn) panel.visible = false;
    if (!preserveFocus) {
      activeColumn = target;
      if (panel) panel.active = false;
      api.window.activeTextEditor = editor;
    }
    return target;
  }
  function assertTreeFocused() {
    assert.equal(panel.visible, true, 'document and diff tabs must never cover the tree');
    assert.equal(panel.active, true, 'tree navigation must keep keyboard focus in the visualizer');
    assert.equal(activeColumn, panel.viewColumn);
    assert.notEqual(editor.viewColumn, panel.viewColumn, 'the restored document must be shown alongside the tree');
  }
  const stored = new Map(), inputs = [], settings = { groupDelay: 0 };
  const errors = [], contexts = new Map(), scrolls = [];
  const api = {
    Uri,
    EventEmitter: class { constructor() { this.event = () => disposable; } fire() {} dispose() {} },
    TreeItem: class { constructor(label) { this.label = label; } },
    ThemeIcon: class {}, Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    TextDocumentChangeReason: { Undo: 1, Redo: 2 },
    ViewColumn: { One: 1, Beside: -2 },
    Selection: class { constructor(anchor, active) { this.anchor = anchor; this.active = active; } },
    TreeItemCollapsibleState: { Expanded: 2, None: 0 },
    commands: {
      registerCommand(name, callback) { commands.set(name, callback); return disposable; },
      async executeCommand(name, ...args) {
        if (name === 'setContext') contexts.set(args[0], args[1]);
        if (name === 'vscode.diff') {
          diffOptions = args[3];
          const column = showInColumn(diffOptions.viewColumn, diffOptions.preserveFocus);
          diffUri = args[0]; api.window.tabGroups.all.find(group => group.viewColumn === column).tabs = [{ input: { original: args[0], modified: args[1] } }];
        }
      }
    },
    workspace: {
      textDocuments: [document],
      fs: {
        async readFile(uri) { const value = stored.get(uri.toString()); if (!value) throw { code: 'FileNotFound' }; return value; },
        async writeFile(uri, value) { stored.set(uri.toString(), Buffer.from(value)); },
        async createDirectory() {},
        async rename(from, to) { stored.set(to.toString(), stored.get(from.toString())); stored.delete(from.toString()); }
      },
      getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
      openTextDocument: async () => document,
      registerTextDocumentContentProvider: (_scheme, contentProvider) => { handlers.snapshot = contentProvider; return disposable; },
      onDidOpenTextDocument: listen('open'), onDidCloseTextDocument: listen('close'),
      onDidSaveTextDocument: listen('save'), onDidChangeConfiguration: listen('configuration'),
      onDidChangeTextDocument: listen('change')
    },
    window: {
      activeTextEditor: editor,
      visibleTextEditors: [editor],
      tabGroups: { all: [{ viewColumn: 1, tabs: [] }], async close(tabs) {
        for (const group of this.all) group.tabs = group.tabs.filter(tab => !tabs.includes(tab));
      } },
      createWebviewPanel() {
        let disposed;
        panel = { ...disposable, viewColumn: activeColumn + 1, visible: true, active: true, closed: false,
          reveal(column, preserveFocus = false) {
            if (column !== undefined) this.viewColumn = column;
            this.visible = true;
            if (!preserveFocus) { this.active = true; activeColumn = this.viewColumn; api.window.activeTextEditor = undefined; }
          },
          dispose() {
            if (this.closed) return;
            this.closed = true; this.active = false;
            activeColumn = editor.viewColumn; api.window.activeTextEditor = editor;
            api.window.tabGroups.all = api.window.tabGroups.all.filter(group => group.viewColumn !== this.viewColumn);
            disposed?.();
          },
          onDidDispose(callback) { disposed = callback; return disposable; },
          webview: { cspSource: 'vscode-webview:', asWebviewUri: uri => uri,
            async postMessage(message) { if (message.type === 'state') visualState = message.state;
              if (message.type === 'scroll') scrolls.push(message.action); },
            onDidReceiveMessage(callback) { handlers.message = callback; return disposable; }
          }
        };
        activeColumn = panel.viewColumn; api.window.activeTextEditor = undefined;
        api.window.tabGroups.all.push({ viewColumn: panel.viewColumn, tabs: [] });
        return panel;
      },
      createTreeView: (_id, options) => { provider = options.treeDataProvider; return { ...disposable, reveal: async () => {} }; },
      showTextDocument: async (_document, options) => {
        editor.viewColumn = showInColumn(options.viewColumn, options.preserveFocus);
        api.window.visibleTextEditors = [editor];
        return editor;
      },
      onDidChangeActiveTextEditor: listen('active'),
      showErrorMessage: message => errors.push(message),
      showInformationMessage: () => {},
      showInputBox: async () => inputs.shift(),
      showQuickPick: async choices => choices[0]
    }
  };
  const originalLoad = Module._load;
  let activate;
  try {
    Module._load = function (name, ...args) { return name === 'vscode' ? api : originalLoad.call(this, name, ...args); };
    ({ activate } = require('../src/extension'));
  } finally { Module._load = originalLoad; }
  activate({ subscriptions: [], extensionUri: Uri.parse('file:/extension'), globalStorageUri: Uri.parse('file:/storage') });
  const run = (name, ...args) => commands.get(`undoTree.${name}`)(...args);
  const bindings = require('../package.json').contributes.keybindings.filter(binding => binding.command === 'undoTree.visualizerKeyAction');
  const key = value => {
    const binding = bindings.find(binding => binding.key === value);
    assert.ok(binding, `missing host binding for ${value}`);
    assert.match(binding.when, /activeWebviewPanelId == undoTree.visualizer/);
    assert.match(binding.when, /undoTree.emacsKeybindings/);
    assert.match(binding.when, /!inputFocus/);
    return commands.get(binding.command)(binding.args);
  };

  editText('AB');
  editText('ABC');
  await run('undo');
  assert.equal(text, 'AB');
  editText('ABD');
  const root = provider.getChildren()[0];
  const b = provider.getChildren(root)[0];
  const branches = provider.getChildren(b);
  assert.equal(branches.length, 2);
  await run('restore', branches[1]);
  assert.equal(text, 'ABC');
  await run('undo');
  await run('redo');
  assert.equal(text, 'ABC');
  await run('diff', branches[0]);
  assert.equal(handlers.snapshot.provideTextDocumentContent(diffUri), 'ABD');
  editText('AB', 1);
  assert.equal(provider.getTreeItem(b).description, 'Current');
  await run('chooseBranch');
  assert.equal(text, 'AB');
  await run('redo');
  assert.equal(text, 'ABD');
  acceptEdits = false;
  await run('undo');
  assert.equal(text, 'ABD');
  assert.equal(errors.length, 1);
  acceptEdits = true;
  await run('undo');
  assert.equal(text, 'AB');
  afterEdit = () => { afterEdit = undefined; editText('ABC!'); };
  await run('restore', branches[1]);
  assert.equal(text, 'ABC!');
  await run('undo'); assert.equal(text, 'ABC', 'an intervening edit should remain attached to the state actually restored');
  await run('undo'); assert.equal(text, 'AB');
  assert.equal(errors.length, 2);
  handlers.close(document);
  assert.deepEqual(provider.getChildren(), []);
  handlers.open(document);
  await run('undo');
  assert.equal(text, 'A', 'closing and reopening should restore the saved undo tree');
  await run('redo'); assert.equal(text, 'AB');
  editText('AB1'); editText('AB2');
  await run('show'); assert.match(panel.webview.html, /Content-Security-Policy/);
  assert.equal(visualState.style, 'graphical');
  const initial = visualState.current;
  await run('visualizerKeyAction', 'up'); assert.equal(text, 'AB2', 'standard mode must ignore Emacs host commands');
  await run('visualizeEmacs'); assert.equal(visualState.keybindings, 'emacs');
  assert.equal(contexts.get('undoTree.emacsKeybindings'), true);
  const emacsPanel = panel;
  await key('ctrl+p'); assert.equal(text, 'AB1'); assertTreeFocused();
  await key('ctrl+n'); assert.equal(text, 'AB2'); assertTreeFocused();
  panel.active = false;
  await run('visualizerKeyAction', 'up'); assert.equal(text, 'AB2', 'an unfocused tree must not receive navigation');
  panel.reveal();
  await key('ctrl+v'); assert.equal(scrolls.at(-1), 'pageDown'); assert.equal(text, 'AB2');
  await handlers.message({ action: 'selection' });
  await key('alt+v'); assert.equal(text, 'AB2');
  assert.notEqual(visualState.selected, initial, 'Emacs page keys select without restoring in selection mode');
  await key('ctrl+b'); await key('ctrl+f'); assert.equal(text, 'AB2');
  await key('alt+shift+]'); assert.equal(text, 'AB2');
  await key('alt+shift+['); assert.equal(text, 'AB2', 'significant-point selection must preserve the document');
  await handlers.message({ action: 'selection' });
  await handlers.message({ action: 'keybindings' }); assert.equal(visualState.keybindings, 'standard');
  assert.equal(contexts.get('undoTree.emacsKeybindings'), false); assert.equal(panel, emacsPanel);

  await handlers.message({ action: 'up' }); assert.equal(text, 'AB1'); assertTreeFocused();
  await handlers.message({ action: 'down' }); assert.equal(text, 'AB2'); assertTreeFocused();
  await handlers.message({ action: 'node', id: initial }); assertTreeFocused();
  await handlers.message({ action: 'selection' });
  await handlers.message({ action: 'up' });
  assert.equal(text, 'AB2', 'selection movement must not modify the file');
  assert.notEqual(visualState.selected, initial);
  const selected = visualState.selected, firstPanel = panel;
  await handlers.message({ action: 'style' });
  assert.equal(visualState.style, 'text'); assert.ok(visualState.textTree.text.includes('|'));
  assert.equal(visualState.selectionMode, true); assert.equal(visualState.selected, selected);
  assert.equal(visualState.current, initial); assert.equal(text, 'AB2'); assertTreeFocused();
  await run('visualizeText'); assert.equal(panel, firstPanel, 'opening text mode must reuse the session and preserve the abort state');
  assert.equal(visualState.style, 'text'); assert.equal(visualState.selected, selected); assertTreeFocused();
  await handlers.message({ action: 'diff' });
  assert.equal(api.window.tabGroups.all[0].tabs.length, 1);
  assert.notEqual(diffOptions.viewColumn, panel.viewColumn); assertTreeFocused();
  await handlers.message({ action: 'diff' });
  assert.equal(api.window.tabGroups.all[0].tabs.length, 0, 'disabling visualizer diff closes its preview');
  await handlers.message({ action: 'set' }); assert.equal(text, 'AB1'); assertTreeFocused();
  // Moving the tree into the source column and closing the other group must also be safe.
  panel.viewColumn = editor.viewColumn; activeColumn = panel.viewColumn;
  api.window.visibleTextEditors = [];
  api.window.tabGroups.all = [{ viewColumn: panel.viewColumn, tabs: [] }];
  await handlers.message({ action: 'down' }); assert.equal(text, 'AB2'); assertTreeFocused();
  await handlers.message({ action: 'up' }); assert.equal(text, 'AB1'); assertTreeFocused();
  await handlers.message({ action: 'diff' }); assertTreeFocused();
  assert.equal(visualState.style, 'text'); assert.ok(visualState.textTree.positions.length > 1);
  assert.notEqual(diffOptions.viewColumn, panel.viewColumn);
  await handlers.message({ action: 'diff' }); assertTreeFocused();
  await handlers.message({ action: 'style' }); assert.equal(visualState.style, 'graphical'); assert.equal(text, 'AB1');
  await handlers.message({ action: 'abort' }); assert.equal(text, 'AB2'); assert.equal(panel.closed, true);
  settings.visualizerStyle = 'text';
  await run('show'); assert.equal(visualState.style, 'text');
  const configuredPanel = panel;
  settings.visualizerKeybindings = 'emacs';
  handlers.configuration({ affectsConfiguration: key => ['undoTree', 'undoTree.visualizerKeybindings'].includes(key) });
  assert.equal(panel, configuredPanel); assert.equal(visualState.style, 'text');
  assert.equal(visualState.keybindings, 'emacs');
  settings.visualizerStyle = 'graphical';
  handlers.configuration({ affectsConfiguration: key => ['undoTree', 'undoTree.visualizerStyle'].includes(key) });
  assert.equal(panel, configuredPanel); assert.equal(panel.closed, false); assert.equal(visualState.style, 'graphical');
  editText('AB3'); assert.equal(panel.closed, true, 'ordinary edits end the visualizer session');
  assert.equal(contexts.get('undoTree.emacsKeybindings'), false);
  inputs.push('x'); await run('saveState'); editText('AB4'); inputs.push('x'); await run('restoreState'); assert.equal(text, 'AB3');
  await run('saveHistory'); handlers.close(document);
  text = 'changed outside VS Code'; handlers.open(document); await run('undo');
  assert.equal(text, 'changed outside VS Code', 'a saved history with a mismatched hash must not load');
  settings.maxFileSize = 1000;
  editText('x'.repeat(1001)); assert.deepEqual(provider.getChildren(), []);
  assert.doesNotThrow(() => editText('small'));
  await run('undo'); assert.equal(text, 'small', 'resumed tracking starts at the current text, not an invented pre-change state');
  assert.equal(errors.length, 2);
});
