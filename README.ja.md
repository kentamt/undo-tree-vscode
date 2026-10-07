# Undo Tree for VS Code

**Port of Toby Cubitt's Emacs undo-tree.**

Toby Cubittによる[Emacs undo-tree 0.8.2](https://www.dr-qubit.org/undo-tree.html)の分岐履歴と可視化を、VS Codeへ移植した拡張です。元の設計・アルゴリズムを尊重し、[参照ソースと著作権表示](upstream/README.md)を保持しています。

[English](README.md) · [操作・設定](docs/USAGE.ja.md) · [移植ノート](docs/PORTING.md)

## 主な機能

- Undo後に別の編集をしてもRedo枝を保持し、任意の状態に戻れる履歴。
- SVG・Emacs風テキスト表示と、Emacsキーバインドによる移動。
- 差分プレビュー、本文を変えない選択モード、履歴の永続化。

実行時にEmacsは必要ありません。

## インストール

**VS Code 1.85以上**が必要です。**Node.js 18以上・Python 3.9以上**でVSIXを作成します。

```sh
npm run package
```

VS Codeで **Extensions: Install from VSIX...** を実行し、`branching-undo-tree-0.4.0.vsix`を選びます。GitHub Releaseに添付されたVSIXも利用できます。

## 使い方

**Undo Tree: Visualize History**、または`Ctrl+Alt+Z`（macOSでは`Cmd+Option+Z`）でツリーを開きます。

| キー | 動作 |
| --- | --- |
| `↑` / `↓` | Undo／Redo |
| `←` / `→` | Redo枝を選択 |
| `v` | SVG・テキスト表示を切り替え |
| `s`、Enter | 状態を選択し、復元 |
| `d` | 差分プレビューを切り替え |
| `q` | ツリーを閉じる |

**Emacs keys**を有効にすると`C-p/n/b/f`で移動できます。`C`はControl（macOSでもControl）、`M`はAlt／Optionです。テキスト表示とEmacsキーを既定にする設定：

```json
{
  "undoTree.visualizerStyle": "text",
  "undoTree.visualizerKeybindings": "emacs"
}
```

通常のUndo／Redoキーは既定でUndo Treeを使います。元の割り当てを使う場合は`undoTree.overrideStandardUndo`を`false`にしてください。保存履歴には過去の本文を含みます。選択範囲だけのUndoやEmacsの履歴ファイルとの互換性は未実装です。詳細は[操作・設定](docs/USAGE.ja.md)と[移植ノート](docs/PORTING.md)を参照してください。

## 開発

VS Codeで開いて**F5**で起動できます。依存のインストール・ビルドは不要です。

```sh
npm test
npm run check
```

元のEmacs版から生成した参照結果と比較し、Emacsがあれば実行時比較も行います。[開発ガイド](CONTRIBUTING.md)・[変更履歴](CHANGELOG.md)・[公開手順](docs/RELEASING.md)を参照してください。

## ライセンス

元のundo-treeに合わせて **GPLv3以降**（`GPL-3.0-or-later`）です。移植元の著作権・帰属表示を保持しています。[LICENSE](LICENSE)・[NOTICE](NOTICE)を参照してください。
