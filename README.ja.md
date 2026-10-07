# Undo Tree for VS Code

Undo後に別の編集をしても、前の未来を枝として残すVS Code拡張です。

[Emacs undo-tree 0.8.2](https://elpa.gnu.org/packages/undo-tree.html)の履歴モデルと可視化の主要な操作を移植しています。過去の状態に戻り、複数の編集案をツリー上で行き来できます。実行時にEmacsは必要ありません。

[English](README.md) · [操作・設定リファレンス](docs/USAGE.ja.md) · [移植内容](docs/PORTING.md) · [変更履歴](CHANGELOG.md)

## 主な機能

- 過去のRedo先を保持する分岐履歴と、任意の状態への復元。
- SVG表示と、Emacs風のテキスト表示。
- `C-p/n/b/f`で移動できるEmacsキーバインドモード。
- 本文を変えずに履歴を探索し、Enterで復元する選択モード。
- 差分プレビュー、時刻表示、保存状態の印、1文字のレジスタ。
- ファイルごとの履歴保存と、内容ハッシュを確認しての再読み込み。
- 操作中もツリーを表示し、移動後にフォーカスを維持。本文と差分は隣のエディタグループで表示。

移植の範囲とEmacs版との違いは[移植ノート](docs/PORTING.md)に記載しています。

## インストール

**VS Code 1.85以上**が必要です。

このリポジトリからVSIXを作成してインストールします。GitHub ReleasesにVSIXが公開されている場合は、そのファイルも利用できます。

ローカルで作成する場合は**Node.js 18以上・Python 3.9以上**を用意し、リポジトリのルートで実行します。

```sh
npm run check
npm test
npm run package
```

npm依存はなく、`npm install`は不要です。パッケージはネットワーク接続なしで作成でき、`branching-undo-tree-0.4.0.vsix`が生成されます。

VS Codeのコマンドパレットから **Extensions: Install from VSIX...**（拡張機能: VSIXからのインストール）を実行して、このファイルを選びます。再読み込みを求められたら実行してください。`code`コマンドがある場合は次でも更新できます。

```sh
code --install-extension branching-undo-tree-0.4.0.vsix --force
```

## まず試す

1. テキストファイルに`A`を入力して保存し、`B`を追加して保存します。
2. Undoで`A`に戻り、`C`を追加します。本文は`AC`になりますが、`AB`の枝も残ります。
3. **Undo Tree: Visualize History**を実行します。ショートカットはWindows/Linuxで`Ctrl+Alt+Z`、macOSで`Cmd+Option+Z`です。
4. `↑`で分岐点に戻り、`←` / `→`で枝を選び、`↓`でRedoします。ノードをクリックして直接復元することもできます。

通常のUndo／Redoショートカットは既定でこの拡張を使います。元の割り当てを使う場合は`undoTree.overrideStandardUndo`を`false`にし、Undo Treeのコマンドで操作してください。

## 表示とキー操作

| キー・ボタン | 動作 |
| --- | --- |
| `↑` / `↓`、`p` / `n` | Undo／Redo |
| `←` / `→`、`b` / `f` | 本文を変えずにRedo枝を選択 |
| `v` / **Text** | SVG・テキスト表示を切り替え |
| `s` / **Selection** | 選択モード。移動しても本文を変えない |
| 選択モードでEnter | 選択した状態を復元 |
| `t` / **Time** | 時刻表示を切り替え |
| `d` / **Diff** | 差分プレビューを切り替え |
| `q` / **Quit** | 現在の状態を保って閉じる |
| **Abort** | ツリーを開いた時の状態に戻して閉じる |

赤は現在の状態、緑はRedo経路、青は保存状態です。テキストでは`o`が通常、`x`が現在、`s`が保存状態を表し、保存・レジスタの印は`x`より優先します。

本文の通常編集を再開するとツリーは閉じます。履歴の復元による本文変更は自動保存しません。

### Emacsモード

**Emacs keys**ボタン、または **Undo Tree: Visualize with Emacs Keys** で有効にします。テキスト・SVGの両方で使えます。

- `C-p` / `C-n`：Undo／Redo。選択モードでは上下に選択を移動。
- `C-b` / `C-f`：Redo枝を選択。選択モードでは同じ段を左右に移動。
- `C-↑` / `C-↓`、`M-{` / `M-}`：分岐点・保存状態・レジスタまで移動。
- `C-v` / `M-v`：下／上にスクロール。選択モードでは10段移動。
- `,` / `.`、`<` / `>`：左右にスクロール。選択モードでは横に10ノード移動。
- `C-q`：Abort。

`C`はControl（macOSでもControl）、`M`はAlt（macOSではOption）です。`M-{` / `M-}`は`Alt+Shift+[` / `Alt+Shift+]`に割り当てています。Emacsモードのツリーにフォーカスがある間に有効です。`C-v` / `M-v`は追加のページ移動ショートカットです。

テキスト表示とEmacsキーを既定にするには、VS Codeの`settings.json`に追加します。

```json
{
  "undoTree.visualizerStyle": "text",
  "undoTree.visualizerKeybindings": "emacs"
}
```

全コマンドと設定は[操作・設定リファレンス](docs/USAGE.ja.md)を参照してください。

## 保存と制限

履歴は初期本文と変更差分として、拡張のglobal storage内の`histories`に保存します。過去の本文を復元できるデータを含みます。現在の本文のハッシュが一致する履歴のみ読み込み、Untitledファイルとレジスタは永続化しません。Emacsの`.~undo-tree~`ファイルとは互換性がありません。

- Undo／Redoはファイル全体が対象です。選択範囲だけのUndo、Emacsのprefix引数、テキストプロパティ、厳密なpoint／marker復元は未移植です。
- VS Code内部のUndoスタックとは別管理です。メニューや他の拡張経由のUndoは編集境界が異なる場合があります。拡張起動前の履歴は取り込みません。
- 通常のファイル、Untitled、VS Code Remoteのテキスト文書が対象です。ノートブックとカスタムエディタは対象外です。
- 履歴数は現在の状態と最後のUndoを保護するため設定値を超える場合があります。最大サイズを超えた文書は追跡を停止し、小さくなると新しい履歴から再開します。
- 自動テストはモデル・元のEmacsとの比較・VS Code APIとDOMのモック統合を検証します。実際のExtension Development Hostとインストールの手動確認は未完了です。

## 開発・ライセンス

VS Codeでこのリポジトリを開き、**F5**で **Run Undo Tree Extension** を起動できます。ビルドは不要です。`npm test`と`npm run check`で検証します。`emacs`がPATHにあれば元のソースとの実行時比較も行い、なければ保存済みのEmacs結果との比較を行います。

開発手順は[CONTRIBUTING.md](CONTRIBUTING.md)、GitHubへの公開手順は[docs/RELEASING.md](docs/RELEASING.md)に記載しています。

ライセンスは **GPL-3.0-or-later**。移植元はToby Cubittのundo-treeで、著作権表示と未変更の参照ソースを[upstream/](upstream/README.md)に保持しています。[LICENSE](LICENSE)・[NOTICE](NOTICE)を参照してください。
