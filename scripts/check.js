// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
for (const dir of ['src', 'media', 'scripts', 'test']) {
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.js'))) execFileSync(process.execPath, ['--check', path.join(dir, file)]);
}
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const commands = new Set(manifest.contributes.commands.map(command => command.command));
for (const binding of manifest.contributes.keybindings) if (!commands.has(binding.command)) throw new Error(`Unregistered command: ${binding.command}`);
for (const items of Object.values(manifest.contributes.menus)) for (const item of items) if (!commands.has(item.command)) throw new Error(`Unregistered menu: ${item.command}`);
console.log('JavaScript syntax and command contributions checked.');
