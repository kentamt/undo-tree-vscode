# undo-tree 0.8.2 → VS Code

This project ports the buffer-wide history and visualizer behavior of undo-tree 0.8.2. It is not a complete Emacs runtime or an implementation of every optional undo-tree feature. The reference is the unmodified, pinned `upstream/undo-tree/undo-tree.el`; its hash and provenance are in `upstream/README.md`.

## Source mapping

| Original function / structure | Original lines | Port | Preserved behavior |
| --- | --- | --- | --- |
| `undo-tree`, `undo-tree-node` | 1292–1366 | `History`, node objects | Root/current; previous/next links; undo/redo changesets; timestamps; active branch index |
| `undo-tree-grow`, `undo-list-transfer-to-tree` | 1591–1597, 1829–1887 | `History.create`, `record` | New branch pushed to the front, branch index reset to zero, previous futures retained |
| `undo-tree-undo-1`, `undo-tree-redo-1` | 2872–3069 | `History.plan`, `move` | Apply inverse/forward changes, move current pointer, timestamp nodes reached by navigation |
| `undo-tree-switch-branch` | 3073–3107 | `History.switchBranch`, command `chooseBranch` | Selects the future redo path without changing text; toggles with two branches, prompts with more |
| `undo-tree-set` | 3110–3140 | `History.plan`, `move` | Find common ancestor, undo to intersection, redo toward target, select the target path in ancestor branch indices |
| `undo-tree-oldest-leaf` | 1943–1951 | `History.oldestLeaf` | Descend into the oldest immediate child at each fork |
| `undo-tree-discard-node` | 1954–2024 | `History.discardNode` | Root/leaf removal, parent-link maintenance, current-state and last-undo protection |
| `undo-tree-compute-widths`, `undo-tree-node-compute-widths` | 2131–2215 | `History.widths` | Same left/center/right widths for even and odd numbers of children, bottom-up traversal |
| `undo-tree-draw-subtree` | 3862–3990 | `Visualizer.layout`, `renderText` | SVG layout and literal text layout; text preserves the two connector rows and ASCII branch geometry |
| `undo-tree-draw-node` | 3808–3859 | `renderText` | Node characters follow register → saved → current → ordinary precedence (`r` / `s` / `x` / `o`) |
| `undo-tree-node-char-lwidth/rwidth` | 3993–4006 | `renderText` | Convert subtree widths into character widths, including the even-child center-gap correction |
| `undo-tree-timestamp-to-string` | 4132–4177 | `timestampString` | Relative/absolute timestamp strings with fixed padding, current marker and register suffix |
| Visualizer and selection keymaps | 1181–1283 | Manifest keybindings, `visualizerAction`, webview controls | Optional tree-scoped Emacs Control/Meta keys; movement follows navigation or selection mode; horizontal scrolling/select-ten behavior |
| `undo-tree-visualize-switch-branch-right/left` | 4286–4320 | `History.cycleBranch` | Clamp at first/last branch, no wrap, no text edit |
| `undo-tree-visualizer-set`, `mouse-set` | 4356–4380 | Webview node click / Enter | Set the buffer to the selected node |
| `undo-tree-visualizer-selection-mode`, selection commands | 4563–4680 | `Visualizer.toggleSelection`, `select` | Navigate independently of buffer state; left/right select nodes in the same display row, including cousins |
| `undo-tree-visualize-undo-to-x`, `redo-to-x` | 4383–4488 | `History.branchPoint`, visualizer Ctrl+Up/Down | Move at least once; stop at branch, saved state or register; explicit branch-only commands also provided |
| `undo-tree-visualizer-quit`, `abort` | 4323–4353 | Webview q / Ctrl+q | Quit keeps current state; abort returns to the state when the visualizer was opened |
| `undo-tree-save-state-to-register`, `restore-state-from-register` | 3144–3189 | Commands `saveState`, `restoreState` | Bind a one-character register to a node; reject another document or an expired node |
| `undo-tree-save-history`, `load-history` | 3362–3496 | `History.serialize/deserialize`, `HistoryStorage` | Versioned tree data and content SHA-1 guard; refuse mismatched/corrupt histories |
| `undo-tree-visualizer-toggle-diff`, `undo-tree-diff` | 4686–4751 | Visualizer d / `showDiff` | Default compares current state toward its parent; selection mode compares toward selected state; preview does not mutate history |
| `undo-tree-kill-visualizer` | 3576–3583 | Text change listener | Normal edits end the visualizer session; tree navigation does not |

## Host adaptations

- **Changesets:** Emacs `primitive-undo`, point/marker entries, text properties and GC object pools have no equivalent in the regular VS Code text-document API. Store validated UTF-16 insert/delete/replace changesets instead. Multi-cursor changes in one VS Code transaction are applied right to left, reversed as a unit on undo. Redo and inverse data are computed eagerly, rather than generated lazily by Emacs `primitive-undo`.
- **Editor application:** The model computes each change along the source traversal path. The VS Code adapter applies the resulting minimal contiguous replacement in one `TextEditor.edit` transaction and commits when the matching document event confirms that change. This allows a synchronous follow-up edit by another extension to attach to the actual restored state. It refuses navigation if the source state changed while the editor was being opened, and checks the final document after the edit completes. Point is restored near the final changed span, using a single VS Code selection; Emacs point/marker restoration is not reproduced exactly.
- **Edit boundaries:** Emacs command-loop undo boundaries are not exposed by VS Code. Typing groups use an idle interval, and are sealed by navigation, save, file switch, diff display or register creation. With `groupDelay: 0`, each document event is a separate changeset. Text equality does not merge distinct explicit transactions.
- **Native undo:** The regular text editor's internal stack cannot be replaced through the public API used here. Standard keyboard shortcuts default to this extension's commands. Native undo/redo invoked through menus or other extensions is reconciled only along the corresponding tree route; otherwise it is recorded as another change. It cannot always have identical grouping to the port's history. Before-extension native history is not imported.
- **History limits:** The source's root/leaf discard algorithm is ported; the memory threshold policy is adapted to a configurable node count. The count is a soft limit because current-state and final-undo protection can stop pruning. High-resolution epoch timestamps approximate Emacs high-resolution time. A nil branch index left by discarding an active leaf is normalized to zero in JavaScript.
- **Saved state:** A node is marked when the document is saved; earlier saved markers are cleared. This substitutes for Emacs buffer modification-time entries. Register references live for the extension session and are not persisted.
- **Persistence:** Store JSON in the extension's global storage under hashed document URI filenames, using ordered atomic writes. This replaces Emacs Lisp serialization and adjacent `.~undo-tree~` files. Emacs's existing history files cannot be loaded into the extension. File saves, closes and extension deactivation save history when enabled. A loaded history must match the currently opened document. No before-startup changes or unknown external edits are reconstructed.
- **Visualizer:** The webview supports SVG and literal monospace text. Text mode ports the original ASCII drawing and character spacing; the surrounding viewport margins and blank top margin are normalized instead of reproducing Emacs window centering. Emacs buffer faces, markers, dedicated windows and lazy drawing are replaced by VS Code theme colors, a webview and diff editors. Restored documents and diff previews are opened in a separate group from the visualizer; navigation explicitly restores focus to the visualizer. If groups are moved or closed, the adapter chooses another group or creates one beside the tree. Text mode uses the source's relative timestamp strings, while SVG keeps absolute local times. Relative ages retain upstream's unit thresholds; future dates are clamped to zero instead of showing a negative age.

- **Keybindings:** Optional Emacs mode contributes Control/Alt shortcuts guarded by `activeWebviewPanelId`, the selected key mode, and input/find-widget focus. Modified keys are handled only by extension commands; VS Code forwards webview key events even after `preventDefault`, so also handling them in the frontend would produce duplicate navigation. Meta is adapted to Alt/Option; `C-v`/`M-v` are additional page-navigation aliases. Plain keys remain frontend actions. Mode changes reuse the panel and preserve selection and the Abort target.

## Not ported

`undo-tree-pull-undo-in-region-branch` and `undo-tree-pull-redo-in-region-branch` (and their fragment-splicing/delta-adjustment helpers) are not implemented. The source disables this optional feature by default (`undo-tree-enable-undo-in-region` is nil). Selecting text in VS Code still uses whole-document undo; it must not be described as regional undo. Emacs-specific prefix arguments, menus, text-property undo, marker restoration, save-file compression and weak-reference garbage collection are also not implemented.

## Evidence

`test/oracle.el` loads the **unmodified upstream package in real Emacs** and performs edits, undo, redo, branch switches, arbitrary node jumps and discards. It records buffer text, root/current node identity, ordered children, active branch indices and exact left/center/right drawing widths after every operation. Scenarios include two/three branches, equal-text distinct states, cross-branch jumps, Unicode text, and root/leaf/current-state discard protection.

`test/conformance.test.js` executes the same operations in the JavaScript port and compares every trace to the committed Emacs fixture. If Emacs is installed, it also compares to a fresh upstream run. The oracle clears the original width cache before computing widths, as a freshly drawn visualizer does; the reference source itself is unchanged.

Additional tests cover transaction reversal, typing boundaries, stale/corrupt saved data, ordered atomic writes, changeset storage size, and an adapter driven by a mock VS Code API. The adapter test includes reopening persisted history, branch selection without editing, selection-mode navigation, diff lifecycle, set/abort, external edits closing the visualizer, registers and file-size tracking resumption.

`test/text-oracle.el` calls the unmodified `undo-tree-draw-tree` in a real Emacs buffer and extracts its text and node marker positions. `test/text-renderer.test.js` compares the port to these results for eight trees covering chains, odd/even nested forks, saved and register symbols, and relative/absolute timestamps. Only viewport-dependent outer whitespace is removed. `test/webview.test.js` executes the actual frontend script in a small DOM harness and checks literal text, node hit targets, Enter behavior in selection mode, toolbar focus, and both renderers. The adapter test checks that switching styles or changing the default style reuses the panel and preserves history, selection and Abort state.

These checks do not establish a fully tested native VS Code UI. The Extension Development Host and installation need a manual smoke test in VS Code; automated model and mock integration tests do not replace those manual checks.
