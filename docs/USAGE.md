# Usage and settings

[Back to README](../README.md)

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

For the source mapping, host adaptations, and verification details, read [docs/PORTING.md](PORTING.md). A full Japanese operation and command reference is available in [docs/USAGE.ja.md](USAGE.ja.md).
