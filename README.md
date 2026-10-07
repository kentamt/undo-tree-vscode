# Undo Tree for VS Code

Keep both futures when you undo and try a different edit.

Undo Tree is a VS Code extension that ports the core history and visualizer behavior of [Emacs undo-tree 0.8.2](https://elpa.gnu.org/packages/undo-tree.html). It keeps abandoned redo paths as branches, so you can return to an earlier state and explore a different version of your document.

[日本語](README.ja.md) · [Contributing](CONTRIBUTING.md) · [Porting notes](docs/PORTING.md) · [Changelog](CHANGELOG.md)

```text
        A
       / \
      AC  AB
      ↑   ↑
   new edit   previous future
```

This diagram illustrates two document states after undoing `AB` to `A` and editing it into `AC`. Both branches remain available.

## Features

- Branching Undo/Redo and direct restoration of any retained state.
- SVG visualization and Emacs-style monospace text, with `o`, `x`, and `s` state markers.
- Optional Emacs navigation keys: `C-p`, `C-n`, `C-b`, and `C-f`.
- Selection mode to explore the tree without changing the document, then restore with Enter.
- Diff previews, timestamps, saved-state markers, and one-character state registers.
- Per-file history persistence, with a content-hash check before reloading.
- A tree view that stays visible and receives focus after navigation; the document and diffs open alongside it.

The extension runs without Emacs or additional runtime dependencies. It is a source-based port of selected undo-tree behavior; see [compatibility and differences](docs/PORTING.md) for the scope.

## Install

Requires **VS Code 1.85 or later**.

Install a VSIX built from this repository. If a GitHub Release includes a VSIX, you can use that artifact instead.

To build locally, install **Node.js 18+** and **Python 3.9+**, then run these commands from the repository root:

```sh
npm run check
npm test
npm run package
```

No `npm install` is needed: this project has no npm dependencies. Packaging works offline and produces `branching-undo-tree-0.4.0.vsix`.

In VS Code, open the Command Palette, run **Extensions: Install from VSIX...**, and select that file. Reload if prompted. Alternatively:

```sh
code --install-extension branching-undo-tree-0.4.0.vsix --force
```

## Try it

1. Open a text file. Type `A` and save, add `B` and save, then undo back to `A`.
2. Add `C`. The document now contains `AC`, and the earlier `AB` future remains in the tree.
3. Run **Undo Tree: Visualize History**. The shortcut is `Ctrl+Alt+Z` on Windows/Linux or `Cmd+Option+Z` on macOS.
4. Use Up to undo to the fork, Left/Right to choose a redo branch, and Down to follow it. Click a node to restore it directly.

Standard editor Undo/Redo shortcuts use this extension by default. Set `undoTree.overrideStandardUndo` to `false` to keep your existing shortcuts and use Undo Tree commands explicitly.

### Tree controls

| Key or button | Action |
| --- | --- |
| Up / Down, `p` / `n` | Undo / Redo |
| Left / Right, `b` / `f` | Choose the previous / next redo branch without editing |
| `v` / **Text** | Switch between SVG and text views |
| `s` / **Selection** | Toggle selection mode; movement leaves the document unchanged |
| Enter in selection mode | Restore the selected state |
| `t` / **Time** | Toggle timestamps |
| `d` / **Diff** | Toggle the diff preview |
| `q` / **Quit** | Close the tree, keeping the current state |
| **Abort** | Return to the state when the tree opened, then close it |

Red marks the current state, green the active redo route, and blue a saved state. In text mode, `o` means an ordinary state, `x` current, and `s` saved; saved and register markers take precedence over `x`.

Ordinary edits to the tracked document close its visualizer session. Restoring a state changes the document but does not automatically save the file.

### Emacs keys

Click **Emacs keys**, or run **Undo Tree: Visualize with Emacs Keys**. This works in both visualizer styles.

| Keys | Action |
| --- | --- |
| `C-p` / `C-n` | Undo / Redo, or select up / down in selection mode |
| `C-b` / `C-f` | Choose a redo branch, or select left / right in selection mode |
| `C-↑` / `C-↓`, `M-{` / `M-}` | Jump to the previous / next fork, saved state, or register |
| `C-v` / `M-v` | Scroll down / up; select ten levels in selection mode |
| `,` / `.`, `<` / `>` | Scroll left / right; select ten nodes in selection mode |
| `C-q` | Abort |

`C` means **Control**, including on macOS. `M` means **Alt**, or **Option** on macOS. `M-{` and `M-}` are bound to `Alt+Shift+[` and `Alt+Shift+]`. These bindings apply while the Emacs-mode tree is focused. `C-v` and `M-v` are additional page-navigation shortcuts.

To open the text view with Emacs keys by default, add to VS Code's `settings.json`:

```json
{
  "undoTree.visualizerStyle": "text",
  "undoTree.visualizerKeybindings": "emacs"
}
```

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `undoTree.overrideStandardUndo` | `true` | Assign standard editor Undo/Redo shortcuts to Undo Tree |
| `undoTree.visualizerStyle` | `"graphical"` | Default visualizer style: `"graphical"` or `"text"` |
| `undoTree.visualizerKeybindings` | `"standard"` | Default tree keys: `"standard"` or `"emacs"` |
| `undoTree.autoSaveHistory` | `true` | Save history on file save, close, and extension shutdown; reload matching histories |
| `undoTree.groupDelay` | `600` | Milliseconds used to group consecutive edits; `0` records each change event |
| `undoTree.maxNodes` | `200` | Soft limit on retained nodes per document |
| `undoTree.maxFileSize` | `1000000` | Maximum tracked document size in UTF-16 code units |

History is stored as the initial text plus changesets in the extension's global storage, under `histories`. These files contain data that can reconstruct past document content. Only histories matching the document's current content hash are loaded. Untitled documents and registers are not persisted. Emacs `.~undo-tree~` files are not compatible.

## Compatibility and limitations

- Undo/Redo applies to the whole document. Region-only undo, Emacs prefix arguments, text properties, and exact point/marker restoration are not implemented.
- The extension maintains its own history. Native Undo/Redo invoked through menus or other extensions can have different edit boundaries. History from before activation is not imported.
- Files, untitled text documents, and VS Code Remote text documents are supported. Notebooks and custom editors are outside the scope.
- The node limit protects the current state and its last undo step, so it can be exceeded. Documents above the file-size limit stop being tracked; tracking resumes with a new history when they become small enough.
- Automated tests cover the model, source comparisons, and mocked VS Code/webview integration. Native Extension Development Host and installation smoke tests remain to be completed; the tests are not a cross-platform UI certification.

For the source mapping, host adaptations, and verification details, read [docs/PORTING.md](docs/PORTING.md). A full Japanese operation and command reference is available in [docs/USAGE.ja.md](docs/USAGE.ja.md).

## Development

Open this repository in VS Code and press **F5** to launch **Run Undo Tree Extension**. No build step is required. Run `npm test` and `npm run check` before submitting changes.

Tests compare the port with committed results generated by the unmodified Emacs package. If `emacs` is on `PATH`, they also run fresh source comparisons. Emacs is optional for normal development; it is required to regenerate fixtures.

See [CONTRIBUTING.md](CONTRIBUTING.md) for tests and manual checks, and [docs/RELEASING.md](docs/RELEASING.md) for GitHub publication and VSIX packaging.

## License and attribution

Distributed under **GPL-3.0-or-later**. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

The history and visualizer algorithms are translated/adapted from undo-tree by **Toby Cubitt**, copyright Free Software Foundation, Inc. The pinned upstream sources, including queue 0.2 used by the comparison tests, are preserved with their original notices in [upstream/](upstream/README.md).

[GNU ELPA package](https://elpa.gnu.org/packages/undo-tree.html) · [Author's explanation](https://www.dr-qubit.org/undo-tree.html)
