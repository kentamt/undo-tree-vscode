# Changelog

Version history for the local development packages. These entries describe implemented changes; they do not assert that GitHub or Marketplace releases have been published.

## 0.4.0

- Add selectable Emacs keybinding mode in both visualizer styles, a toolbar toggle, and **Visualize with Emacs Keys**.
- Route Control/Alt navigation through VS Code keybindings scoped to the focused Emacs-mode tree, avoiding duplicate handling by the webview.
- Add page movement with `C-v` / `M-v`, significant-point navigation with `M-{` / `M-}`, and horizontal scrolling/selection with `,` / `.`.
- Preserve selection and the original Abort state when changing the keybinding mode or its default setting.

## 0.3.0

- Add Emacs-style text visualization with a Text toggle and **Visualize as Text** command.
- Port ASCII branch layout, node-symbol precedence, and relative timestamp formatting.
- Compare rendered text and node positions with fixtures and live runs of the original Emacs drawing functions.

## 0.2.1

- Keep restored documents and diff previews in an editor group separate from the tree.
- Restore focus to the visualizer after navigation, including when editor groups move or close.

## 0.2.0

- Replace the independent prototype with a source-based port of undo-tree 0.8.2 history and visualizer behavior.
- Add source comparisons, selection mode, diff previews, registers, Abort, and persisted history with a content-hash guard.
- Preserve the upstream source and notices; distribute the port under GPL-3.0-or-later.

## 0.1.0

- Initial independent branching-history prototype.
