// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { History } = require('../src/history');
const { HistoryStorage } = require('../src/storage');
test('atomic history saves are ordered and reload the latest captured tree', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'undo-tree-storage-'));
  const api = { Uri: { joinPath: (dir, name) => path.join(dir, name) }, workspace: { fs: {
    readFile: fs.readFile, writeFile: fs.writeFile, rename: fs.rename, createDirectory: dir => fs.mkdir(dir, { recursive: true })
  } } };
  try {
    const storage = new HistoryStorage(api, directory), history = new History('a', { groupDelay: 0 });
    assert.equal(await storage.load('file:/example'), undefined);
    history.record('ab'); const first = storage.save('file:/example', history);
    history.record('abc'); const second = storage.save('file:/example', history);
    await Promise.all([first, second]); await storage.flush();
    const loaded = History.deserialize(await storage.load('file:/example'), 'abc');
    assert.equal(loaded.undoTarget().text, 'ab');
    assert.equal((await fs.readdir(directory)).filter(name => name.endsWith('.tmp')).length, 0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
