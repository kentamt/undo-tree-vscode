// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { createHash } = require('node:crypto');
class HistoryStorage {
  constructor(vscode, directory) { this.vscode = vscode; this.directory = directory; this.jobs = new Map(); }
  uri(key, suffix = '') {
    return this.vscode.Uri.joinPath(this.directory, `${createHash('sha256').update(key).digest('hex')}.json${suffix}`);
  }
  async load(key) {
    if (!this.directory) return undefined;
    await this.jobs.get(key);
    try { return JSON.parse(Buffer.from(await this.vscode.workspace.fs.readFile(this.uri(key))).toString('utf8')); }
    catch (error) { if (error.code === 'FileNotFound' || error.code === 'ENOENT') return undefined; throw error; }
  }
  save(key, history) {
    if (!this.directory) return Promise.resolve();
    // Capture before awaiting, and serialize per document so stale writes cannot win.
    const content = Buffer.from(JSON.stringify(history.serialize()), 'utf8');
    const job = (this.jobs.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      await this.vscode.workspace.fs.createDirectory(this.directory);
      await this.vscode.workspace.fs.writeFile(this.uri(key, '.tmp'), content);
      await this.vscode.workspace.fs.rename(this.uri(key, '.tmp'), this.uri(key), { overwrite: true });
    });
    this.jobs.set(key, job);
    return job;
  }
  async flush() { await Promise.all(this.jobs.values()); }
}
module.exports = { HistoryStorage };
