// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const vscode = require('vscode');
const { randomBytes } = require('node:crypto');
const { History, delta } = require('./history');
const { Visualizer } = require('./visualizer');
const { HistoryStorage } = require('./storage');
let shutdown;

function activate(context) {
  const histories = new Map(), pending = new Map(), snapshots = new Map(), loads = new Map(), registers = new Map();
  const changed = new vscode.EventEmitter();
  const storage = new HistoryStorage(vscode, context.globalStorageUri && vscode.Uri.joinPath(context.globalStorageUri, 'histories'));
  let selectedUri, session, busy = false, commandQueue = Promise.resolve();
  const config = () => vscode.workspace.getConfiguration('undoTree');
  const supported = doc => ['file', 'untitled', 'vscode-remote'].includes(doc.uri.scheme);
  const options = () => ({ maxNodes: config().get('maxNodes', 200), groupDelay: config().get('groupDelay', 600) });
  const error = err => { void vscode.window.showErrorMessage(`Undo Tree: ${err.message}`); };
  function sendState() {
    void vscode.commands.executeCommand('setContext', 'undoTree.emacsKeybindings', session?.model.keybindings === 'emacs');
    if (session && histories.get(session.uri) === session.model.history) {
      void session.panel.webview.postMessage({ type: 'state', state: session.model.layout() });
    }
  }
  function refresh() { changed.fire(undefined); sendState(); }
  function enqueue(callback) {
    const job = commandQueue.then(callback).catch(error);
    commandQueue = job;
    return job;
  }
  function persist(key, history) {
    return storage.save(key, history).catch(error);
  }
  function track(doc) {
    const key = doc.uri.toString();
    if (!supported(doc)) return;
    const text = doc.getText();
    if (text.length > config().get('maxFileSize', 1000000)) { histories.delete(key); return; }
    if (!histories.has(key)) {
      const history = new History(text, options());
      if (!doc.isDirty) history.markSaved();
      histories.set(key, history);
      if (doc.uri.scheme !== 'untitled' && config().get('autoSaveHistory', true) && storage.directory) {
        const job = storage.load(key).then(data => {
          // Never replace edits made while the history file is being read.
          if (!data || histories.get(key) !== history || history.nodes.size !== 1 || history.text !== text || doc.getText() !== text) return;
          const loaded = History.deserialize(data, text, options());
          histories.set(key, loaded); refresh();
        }).catch(err => {
          // A different file hash is expected when another program has modified the file.
          if (!err.message.includes('document has changed')) error(err);
        });
        loads.set(key, job);
      }
    }
    return histories.get(key);
  }
  function updateActive(editor) {
    if (editor && supported(editor.document)) {
      const next = editor.document.uri.toString();
      if (selectedUri !== next) histories.get(selectedUri)?.seal();
      selectedUri = next; track(editor.document);
    }
    void vscode.commands.executeCommand('setContext', 'undoTree.tracked', Boolean(editor && histories.has(editor.document.uri.toString())));
    refresh();
  }
  async function currentHistory() {
    const editor = vscode.window.activeTextEditor;
    const key = session?.panel.active ? session.uri : editor && supported(editor.document) ? editor.document.uri.toString() : selectedUri;
    await loads.get(key);
    return { key, history: histories.get(key) };
  }
  function sourceViewColumn(active) {
    const treeColumn = active.panel.viewColumn;
    const source = vscode.window.visibleTextEditors?.find(editor =>
      editor.document.uri.toString() === active.uri && editor.viewColumn !== undefined && editor.viewColumn !== treeColumn);
    if (source) return source.viewColumn;
    const groups = vscode.window.tabGroups?.all;
    if (active.sourceColumn !== treeColumn && (!groups || groups.some(group => group.viewColumn === active.sourceColumn))) return active.sourceColumn;
    // Groups can be moved or closed. Never replace the tree, even if it is the only group.
    return groups?.find(group => group.viewColumn !== undefined && group.viewColumn !== treeColumn)?.viewColumn ?? vscode.ViewColumn.Beside;
  }
  function focusVisualizer(active) {
    if (active && session === active) active.panel.reveal(active.panel.viewColumn, false);
  }
  const provider = {
    onDidChangeTreeData: changed.event,
    getChildren(item) {
      const key = item?.uri || selectedUri, history = histories.get(key);
      if (!history) return [];
      return (item ? history.nodes.get(item.id)?.children || [] : [history.root]).map(node => ({ uri: key, id: node.id }));
    },
    getParent(item) {
      const node = histories.get(item.uri)?.nodes.get(item.id);
      return node?.parent ? { uri: item.uri, id: node.parent.id } : undefined;
    },
    getTreeItem(item) {
      const history = histories.get(item.uri), node = history?.nodes.get(item.id);
      if (!node) return new vscode.TreeItem('Expired state');
      const current = node === history.current;
      const label = `#${node.id} · ${new Date(node.time).toLocaleTimeString()}`;
      const treeItem = new vscode.TreeItem(label, node.children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
      treeItem.id = `${item.uri}#${node.id}`;
      treeItem.description = [current ? 'Current' : node.parent?.preferred === node ? 'Active branch' : '', node.saved ? 'Saved' : '', node.register ? `Register ${node.register}` : ''].filter(Boolean).join(' · ');
      treeItem.iconPath = new vscode.ThemeIcon(current ? 'circle-filled' : node.children.length > 1 ? 'git-branch' : 'circle-outline');
      treeItem.contextValue = 'undoTree.state';
      treeItem.tooltip = `${node.children.length} branches · Click to restore this state.`;
      treeItem.command = { command: 'undoTree.restore', title: 'Restore state', arguments: [item] };
      return treeItem;
    }
  };
  const view = vscode.window.createTreeView('undoTree.history', { treeDataProvider: provider, showCollapseAll: true });
  context.subscriptions.push(changed, view);

  async function restore(item) {
    if (busy) return;
    await loads.get(item?.uri);
    const history = histories.get(item?.uri), node = history?.nodes.get(item?.id);
    if (!node || node === history.current) return;
    const origin = history.current, before = history.text, plan = history.plan(node.id);
    if (plan.text.length > config().get('maxFileSize', 1000000)) throw new Error('This state exceeds the configured maximum file size.');
    busy = true;
    const active = session?.uri === item.uri ? session : undefined;
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(item.uri));
      const editor = await vscode.window.showTextDocument(document, {
        preview: false, preserveFocus: Boolean(active), ...(active ? { viewColumn: sourceViewColumn(active) } : {})
      });
      if (active && editor.viewColumn !== undefined) active.sourceColumn = editor.viewColumn;
      if (histories.get(item.uri) !== history || history.current !== origin || !history.nodes.has(node.id) || document.getText() !== before) {
        throw new Error('The document changed. Select the history state again.');
      }
      history.seal();
      const transaction = { history, origin, target: node, text: plan.text, committed: false };
      pending.set(item.uri, transaction);
      // Collapse the path changes into one minimal edit; the core still replays each changeset.
      const edit = delta(before, plan.text);
      const success = before === plan.text || await editor.edit(builder => {
        builder.replace(new vscode.Range(document.positionAt(edit.offset), document.positionAt(edit.offset + edit.removed.length)), edit.inserted);
      }, { undoStopBefore: true, undoStopAfter: true });
      if (!success || document.getText() !== plan.text || history.current !== (transaction.committed ? node : origin)) throw new Error('Could not restore the state because the document changed.');
      if (!transaction.committed) history.move(node.id);
      // Emacs primitive-undo restores point near the changed text. VS Code offsets are UTF-16.
      const last = plan.changes.at(-1);
      if (last) {
        const point = document.positionAt(last.offset + last.inserted.length);
        editor.selections = [new vscode.Selection(point, point)];
      }
      refresh();
    } finally { pending.delete(item.uri); busy = false; focusVisualizer(active); }
  }
  async function navigate(direction, key, toBranch = false, kind = 'branch') {
    await loads.get(key);
    const history = histories.get(key);
    const target = toBranch ? history?.branchPoint(direction, kind) : direction === 'undo' ? history?.undoTarget() : history?.redoTarget();
    if (target) await restore({ uri: key, id: target.id });
  }
  function register(command, callback) {
    context.subscriptions.push(vscode.commands.registerCommand(command, (...args) => enqueue(() => callback(...args))));
  }
  for (const direction of ['undo', 'redo']) {
    register(`undoTree.${direction}`, async () => { const { key } = await currentHistory(); await navigate(direction, key); });
    register(`undoTree.${direction}Branch`, async () => { const { key } = await currentHistory(); await navigate(direction, key, true); });
  }
  register('undoTree.restore', restore);
  register('undoTree.chooseBranch', async () => {
    const { key, history } = await currentHistory();
    if (!history || history.current.children.length <= 1) {
      void vscode.window.showInformationMessage('Undo Tree: Not at an undo branch point.'); return;
    }
    history.seal(); const origin = history.current;
    let branch;
    if (origin.children.length === 2) branch = 1 - origin.branch;
    else {
      const choice = await vscode.window.showQuickPick(origin.children.map((node, index) => ({
        label: `Branch ${index} · #${node.id}`, description: index === origin.branch ? 'Active' : '', branch: index
      })), { placeHolder: 'Select the branch for the next Redo (file remains unchanged)' });
      branch = choice?.branch;
    }
    if (branch !== undefined && histories.get(key) === history && history.current === origin) { history.switchBranch(branch); refresh(); }
  });
  for (const [name, amount] of [['branchLeft', -1], ['branchRight', 1]]) register(`undoTree.${name}`, async () => {
    const { history } = await currentHistory(); history?.cycleBranch(amount); refresh();
  });
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('undo-tree-snapshot', {
    provideTextDocumentContent(uri) { return snapshots.get(uri.toString()) || ''; }
  }));
  let snapshotId = 0;
  async function showDiff(item, towardsTarget = false) {
    const history = histories.get(item?.uri), node = history?.nodes.get(item?.id);
    if (!node) return;
    history.seal();
    const original = vscode.Uri.parse(item.uri), name = original.path.split('/').pop() || 'Untitled';
    const snapshot = vscode.Uri.from({ scheme: 'undo-tree-snapshot', path: `/${++snapshotId}/${name}`, query: `state=${node.id}` });
    snapshots.set(snapshot.toString(), node.text);
    if (towardsTarget && session) session.diffSnapshots.add(snapshot.toString());
    const active = session?.uri === item.uri ? session : undefined;
    await vscode.commands.executeCommand('vscode.diff', towardsTarget ? original : snapshot, towardsTarget ? snapshot : original,
      `Undo Tree: ${name} ↔ #${node.id}`, {
        preview: true, preserveFocus: Boolean(active), ...(active ? { viewColumn: sourceViewColumn(active) } : {})
      });
    focusVisualizer(active);
  }
  register('undoTree.diff', showDiff);

  function visualizerHtml(panel) {
    const nonce = randomBytes(18).toString('base64');
    const resource = name => panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', name));
    const controls = [['up', '↑ Undo'], ['down', '↓ Redo'], ['left', '← Branch'], ['right', 'Branch →'],
      ['undoBranch', 'Previous stop'], ['redoBranch', 'Next stop'], ['style', 'Text (v)'], ['keybindings', 'Emacs keys'], ['selection', 'Selection (s)'], ['timestamps', 'Time (t)'], ['diff', 'Diff (d)'], ['set', 'Restore (Enter)'], ['quit', 'Quit (q)'], ['abort', 'Abort (Ctrl+q)']];
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${resource('visualizer.css')}"></head><body>
<header><div class="toolbar">${controls.map(([action, title]) => `<button data-action="${action}"${['style', 'keybindings', 'selection', 'timestamps', 'diff'].includes(action) ? ' aria-pressed="false"' : ''}>${title}</button>`).join('')}</div>
<div id="status" role="status"></div><div class="help">Red: current · Green: active redo route · Blue: saved · Click a node to restore. In selection mode, click to select, then Enter to restore. Ctrl+↑/↓: jump to a fork, register, or saved state. Abort returns to the state when this view opened.</div></header>
<main id="tree" tabindex="0" aria-label="Undo history"></main><script nonce="${nonce}" src="${resource('visualizer.js')}"></script></body></html>`;
  }
  async function closeDiff(active) {
    const groups = vscode.window.tabGroups;
    if (!groups) return;
    const tabs = groups.all.flatMap(group => group.tabs).filter(tab => active.diffSnapshots.has(tab.input?.modified?.toString()));
    if (tabs.length) await groups.close(tabs, true);
    active.diffSnapshots.clear();
  }
  async function visualizerAction(active, message) {
    if (session !== active || histories.get(active.uri) !== active.model.history || !message || typeof message.action !== 'string') return;
    const model = active.model, history = model.history, action = message.action;
    if (action === 'ready') { sendState(); return; }
    if (action === 'quit') { active.panel.dispose(); return; }
    if (action === 'abort') { await restore({ uri: active.uri, id: model.initial }); active.panel.dispose(); return; }
    if (action === 'keybindings') model.keybindings = model.keybindings === 'emacs' ? 'standard' : 'emacs';
    if (action === 'selection') model.toggleSelection();
    if (action === 'style') model.style = model.style === 'text' ? 'graphical' : 'text';
    if (action === 'timestamps') model.timestamps = !model.timestamps;
    if (action === 'diff') {
      model.diff = !model.diff;
      if (!model.diff) await closeDiff(active);
    }
    if (action === 'node' && Number.isInteger(message.id) && history.nodes.has(message.id)) {
      if (model.selectionMode) model.selected = message.id;
      else await restore({ uri: active.uri, id: message.id });
    }
    if (action === 'set' && model.selectionMode) {
      await restore({ uri: active.uri, id: model.selected }); model.selectionMode = false;
    }
    if (['pageUp', 'pageDown', 'scrollLeft', 'scrollRight'].includes(action)) {
      if (model.selectionMode) model.select(({ pageUp: 'up', pageDown: 'down', scrollLeft: 'left', scrollRight: 'right' })[action], 10);
      else {
        await active.panel.webview.postMessage({ type: 'scroll', action });
        focusVisualizer(active); return;
      }
    }
    if (['up', 'down', 'left', 'right'].includes(action)) {
      if (model.selectionMode) model.select(action);
      else if (action === 'up' || action === 'down') await navigate(action === 'up' ? 'undo' : 'redo', active.uri);
      else if (action === 'left' || action === 'right') history.cycleBranch(action === 'left' ? -1 : 1);
    }
    if (action === 'undoBranch' || action === 'redoBranch') {
      if (model.selectionMode) model.selected = history.branchPoint(action === 'undoBranch' ? 'undo' : 'redo', 'any', history.nodes.get(model.selected)).id;
      else await navigate(action === 'undoBranch' ? 'undo' : 'redo', active.uri, true, 'any');
    }
    if (!model.selectionMode) model.selected = history.current.id;
    refresh();
    if (model.diff) await showDiff({ uri: active.uri, id: model.diffTarget() }, true);
    focusVisualizer(active);
  }
  async function openVisualizer(style, keybindings) {
    const { key, history } = await currentHistory();
    if (!history) { void vscode.window.showInformationMessage('Undo Tree: Open a tracked text file first.'); return; }
    if (session?.uri === key && session.model.history === history) {
      if (style) session.model.style = style;
      if (keybindings) session.model.keybindings = keybindings;
      refresh();
      session.panel.reveal(); return;
    }
    session?.panel.dispose();
    const sourceColumn = vscode.window.visibleTextEditors?.find(editor => editor.document.uri.toString() === key)?.viewColumn
      ?? vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    const panel = vscode.window.createWebviewPanel('undoTree.visualizer', 'Undo Tree', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] });
    const active = { uri: key, panel, sourceColumn,
      model: new Visualizer(history, { style: style || config().get('visualizerStyle', 'graphical'), keybindings: keybindings || config().get('visualizerKeybindings', 'standard') }), diffSnapshots: new Set() }; session = active;
    panel.webview.html = visualizerHtml(panel);
    context.subscriptions.push(panel, panel.onDidDispose(() => { if (session === active) { session = undefined; sendState(); } void closeDiff(active).catch(error); }),
      panel.webview.onDidReceiveMessage(message => enqueue(() => visualizerAction(active, message))));
    sendState();
  }
  register('undoTree.show', () => openVisualizer());
  register('undoTree.visualize', () => openVisualizer());
  register('undoTree.visualizeText', () => openVisualizer('text'));
  register('undoTree.visualizeEmacs', () => openVisualizer(undefined, 'emacs'));
  context.subscriptions.push(vscode.commands.registerCommand('undoTree.visualizerKeyAction', action => {
    const active = session;
    if (!active?.panel.active || active.model.keybindings !== 'emacs' ||
        !['up', 'down', 'left', 'right', 'pageUp', 'pageDown', 'undoBranch', 'redoBranch', 'abort'].includes(action)) return;
    return enqueue(() => visualizerAction(active, { action }));
  }));
  register('undoTree.showSidebar', async () => {
    updateActive(vscode.window.activeTextEditor); await vscode.commands.executeCommand('undoTree.history.focus');
    const history = histories.get(selectedUri);
    if (history) { history.seal(); await view.reveal({ uri: selectedUri, id: history.current.id }, { select: true, focus: true }); }
  });
  register('undoTree.saveState', async () => {
    const { key, history } = await currentHistory(); if (!history) return;
    const name = await vscode.window.showInputBox({ prompt: 'Save state to register (one character)', validateInput: value => [...value].length === 1 ? null : 'Enter one character.' });
    if (!name) return;
    const old = registers.get(name);
    if (old?.history.nodes.get(old.id)?.register === name) old.history.nodes.get(old.id).register = null;
    history.seal(); history.current.register = name;
    registers.set(name, { uri: key, history, id: history.current.id }); refresh();
  });
  register('undoTree.restoreState', async () => {
    const { key, history } = await currentHistory();
    const name = await vscode.window.showInputBox({ prompt: 'Restore state from register (one character)' });
    if (!name) return;
    const state = registers.get(name);
    if (!state || !state.history.nodes.has(state.id)) throw new Error('Register does not contain a retained undo-tree state.');
    if (state.uri !== key || state.history !== history) throw new Error('Register contains a state for a different document.');
    await restore({ uri: key, id: state.id });
  });
  register('undoTree.saveHistory', async () => {
    const { key, history } = await currentHistory(); if (!history) return;
    if (!storage.directory || vscode.Uri.parse(key).scheme === 'untitled') throw new Error('Save the file before saving its undo history.');
    await storage.save(key, history);
    void vscode.window.showInformationMessage('Undo Tree: History saved.');
  });
  register('undoTree.loadHistory', async () => {
    const { key, history } = await currentHistory(); if (!history) return;
    const before = history.text, origin = history.current;
    const data = await storage.load(key);
    if (!data) throw new Error('No saved history for this file.');
    if (history.current !== origin || history.text !== before || histories.get(key) !== history) throw new Error('The document changed while loading history.');
    const loaded = History.deserialize(data, before, options());
    session?.panel.dispose(); histories.set(key, loaded); refresh();
  });

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => { track(doc); refresh(); }),
    vscode.workspace.onDidCloseTextDocument(doc => {
      const key = doc.uri.toString(), history = histories.get(key);
      if (history && config().get('autoSaveHistory', true) && doc.uri.scheme !== 'untitled') {
        // Don't overwrite a still-loading saved tree with a fresh one-node baseline.
        if (!loads.has(key) || history.nodes.size > 1) void persist(key, history);
      }
      if (session?.uri === key) session.panel.dispose();
      histories.delete(key); snapshots.delete(key); loads.delete(key); refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor(updateActive),
    vscode.workspace.onDidSaveTextDocument(doc => {
      const key = doc.uri.toString(), history = histories.get(key); history?.markSaved();
      if (history && config().get('autoSaveHistory', true)) void loads.get(key)?.then(() => persist(key, histories.get(key) || history));
      if (history && !loads.has(key) && config().get('autoSaveHistory', true)) void persist(key, history);
      refresh();
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('undoTree')) return;
      if (['visualizerStyle', 'visualizerKeybindings'].some(key => event.affectsConfiguration(`undoTree.${key}`)) &&
          !['overrideStandardUndo', 'autoSaveHistory', 'maxNodes', 'maxFileSize', 'groupDelay'].some(key => event.affectsConfiguration(`undoTree.${key}`))) {
        if (session && event.affectsConfiguration('undoTree.visualizerStyle')) session.model.style = config().get('visualizerStyle', 'graphical');
        if (session && event.affectsConfiguration('undoTree.visualizerKeybindings')) session.model.keybindings = config().get('visualizerKeybindings', 'standard');
        refresh(); return;
      }
      for (const history of histories.values()) { Object.assign(history, options()); history.seal(); history.prune(); }
      for (const doc of vscode.workspace.textDocuments) track(doc);
      if (session) session.panel.dispose(); updateActive(vscode.window.activeTextEditor);
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!event.contentChanges.length) return;
      const key = event.document.uri.toString(), text = event.document.getText();
      const transaction = pending.get(key);
      if (transaction && !transaction.committed && transaction.text === text && histories.get(key) === transaction.history && transaction.history.current === transaction.origin) {
        // The edit is now real. Commit before another extension can synchronously edit it.
        transaction.history.move(transaction.target.id); transaction.committed = true; return;
      }
      // Like undo-tree-kill-visualizer, edits outside navigation end the visualizer session.
      if (session?.uri === key) session.panel.dispose();
      const previous = histories.get(key), history = track(event.document);
      if (!history) { updateActive(vscode.window.activeTextEditor); return; }
      if (history !== previous) { updateActive(vscode.window.activeTextEditor); return; }
      if (event.reason !== undefined) {
        // Match only the relevant route, never an arbitrary equal-text node on another branch.
        let match;
        for (let node = event.reason === vscode.TextDocumentChangeReason?.Redo ? history.redoTarget() : history.undoTarget(); node;
          node = event.reason === vscode.TextDocumentChangeReason?.Redo ? node.children[node.branch] : node.parent) {
          if (node.text === text) { match = node; break; }
        }
        if (match) history.move(match.id);
        else history.record(text, { boundary: true, changes: event.contentChanges });
      } else history.record(text, { changes: event.contentChanges });
      refresh();
    })
  );
  for (const doc of vscode.workspace.textDocuments) track(doc);
  updateActive(vscode.window.activeTextEditor);
  view.message = 'Newest branches appear first. Click a state to restore; use the diff icon to compare.';
  shutdown = async () => {
    await Promise.all(loads.values());
    if (config().get('autoSaveHistory', true)) {
      await Promise.all([...histories].filter(([key]) => vscode.Uri.parse(key).scheme !== 'untitled').map(([key, history]) => persist(key, history)));
    }
    await storage.flush();
  };
}
async function deactivate() { await shutdown?.(); }
module.exports = { activate, deactivate };
