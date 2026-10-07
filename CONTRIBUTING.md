# Contributing

Thanks for helping improve Undo Tree. Issues and pull requests are welcome. Please describe the document edits or tree actions that trigger a problem, and what you expected to happen.

## Local setup

Use Node.js 18+, Python 3.9+, and VS Code 1.85+. There are no npm dependencies to install and no compilation step.

```sh
npm test
npm run check
npm run package
```

Open the repository in VS Code and press **F5** to start **Run Undo Tree Extension**. Test your changes in that Extension Development Host, using a disposable text file.

## Tests

- `npm test`: history, persistence, text rendering, and mocked extension/webview integration, plus upstream comparison tests.
- `npm run check`: JavaScript syntax and contributed command consistency.
- `npm run test:oracle`: history-model comparisons against upstream traces; includes a live Emacs run when available.
- `npm run fixtures:emacs`: regenerate both history and text-rendering fixtures from the pinned, unmodified upstream package. Requires `emacs` on `PATH` and intentionally changes fixture files.

Normal tests run without Emacs, using committed reference results; the live comparison tests are skipped when Emacs is unavailable. Fixture regeneration must be justified by an upstream/reference change, not used to hide a port regression. Review fixture differences alongside the input scenarios.

## Manual checks

For changes affecting editor behavior or navigation, check these steps in the Extension Development Host:

1. Create `A`, add `B`, undo to `A`, then add `C`. Verify both `AB` and `AC` futures remain and can be restored.
2. Navigate in SVG and text modes. The source file must appear alongside the tree, and keyboard focus must return to the tree.
3. Enable Emacs keys. Check `C-p/n/b/f`, page movement, and Abort. In selection mode, navigation must leave the document unchanged until Enter.
4. Toggle diff previews and close the visualizer. Check that previews close appropriately and normal editing resumes.
5. Save and close a file, reopen it, and check history loading. Change its contents externally and check that stale history is rejected.

If you cannot perform a relevant manual check, state that in the pull request. Mock tests do not establish native UI behavior on all platforms.

## Reporting bugs

Include the extension version, VS Code version, OS, keyboard layout, visualizer style/key mode, relevant `undoTree.*` settings, and a short reproducible edit sequence. For a keyboard conflict, include other keybinding extensions and any custom binding involved.

Use synthetic example text. Saved undo history can reconstruct previous document content; do not attach a real history file unless its contents are suitable for public sharing.

## Pull requests

Explain the behavior before and after the change and the validation performed. Keep fixes focused. Update the English/Japanese README and usage references when public behavior changes.

For source-compatible changes, identify the upstream function being ported and update [docs/PORTING.md](docs/PORTING.md) if the mapping or adaptation changes. Preserve upstream source files and notices; a reference-version update should be explicit and include provenance, hashes, and regenerated fixtures.

The port is distributed under GPL-3.0-or-later. Preserve applicable copyright and license notices; see [LICENSE](LICENSE), [NOTICE](NOTICE), and [upstream/README.md](upstream/README.md).
