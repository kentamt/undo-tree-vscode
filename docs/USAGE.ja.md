# 操作・設定リファレンス

[READMEに戻る](../README.ja.md)

## 基本操作

テキストファイルを編集し、**Cmd/Ctrl+Z** でUndo、**Cmd/Ctrl+Shift+Z** でRedoします。Windows/Linuxでは **Ctrl+Y** もRedoです。

**Cmd+Option+Z**（Windows/Linuxでは **Ctrl+Alt+Z**）または **Undo Tree: Visualize History** で専用のツリー画面を開きます。新しい枝はEmacs版と同じく左側に追加します。赤は現在の状態、緑は選択中のRedo経路、青は保存した状態です。

| ツリー画面での操作 | 動作 |
| --- | --- |
| `↑` / `p` | Undo |
| `↓` / `n` | Redo |
| `←` / `b` | 前のRedo枝を選択。本文は変わりません |
| `→` / `f` | 次のRedo枝を選択。本文は変わりません |
| ノードをクリック | その状態へ移動 |
| `Ctrl+↑` / `Ctrl+↓` | 前／次の分岐点、レジスタ、保存状態まで移動 |
| `s` | 選択モードを切り替え。方向キーやクリックは選択だけを変更 |
| 選択モードで `Enter` | 選択した状態を復元し、通常モードへ戻る |
| 選択モードで `PageUp` / `PageDown` | 10段ずつ選択を移動 |
| `t` | 時刻表示を切り替え |
| `d` | 差分表示を切り替え。通常はUndo先、選択モードでは選択先との比較 |
| `q` | 現在の状態を保って画面を閉じる |
| `Ctrl+q` | 画面を開いた時の状態に戻して閉じる（Abort） |

通常の編集を再開すると可視化画面は閉じます。これはEmacs版の動作に合わせています。復元による本文変更は自動保存しません。

Explorer内の **Undo Tree** にも履歴を表示します。行をクリックして復元、行の差分アイコンで現在のファイルと比較できます。

分岐を試すには、`A`を入力して保存し、`B`を追加して保存します。Undoして `A` に戻り、`C`を追加します。履歴に `AB` と `AC` が残ります。`A` に戻って左右キーで枝を選び、Redoでどちらにも進めます。

## Emacsキーバインドモード

ツリーの **Emacs keys** ボタン、または **Undo Tree: Visualize with Emacs Keys** コマンドで有効にします。テキスト表示でもSVG表示でも使え、モードを切り替えても現在位置・選択・Abort先を保ちます。テキスト表示は **Text** ボタン（`v`）、または **Undo Tree: Visualize as Text** で選べます。

| キー | 動作 |
| --- | --- |
| `C-p` / `C-n` | Undo／Redo。選択モードでは選択だけを上下に移動 |
| `C-b` / `C-f` | 前／次のRedo枝。選択モードでは同じ段のノードへ移動 |
| `M-{` / `M-}`、`C-↑` / `C-↓` | 前／次の分岐点・保存状態・レジスタまで移動 |
| `C-v` / `M-v` | 下／上にスクロール。選択モードでは10段移動 |
| `,` / `.`、`<` / `>` | 左／右にスクロール。選択モードでは横に10ノード移動 |
| `s`、`Enter` | 選択モード切り替え、選択した状態の復元 |
| `q` / `C-q` | 終了／開いた時の状態へ戻して終了 |

`C-` はControl、`M-` はAlt（macOSではOption）です。macOSでもControlを使います。`M-{` / `M-}` はAlt+Shift+`[` / `]` として割り当てています。キー割り当てはEmacsモードのツリーにフォーカスがある間に有効です。

毎回Emacsモードで開くには設定に追加します。

```json
{
  "undoTree.visualizerKeybindings": "emacs"
}
```

元のundo-treeのキーマップに合わせて移植し、`C-v` / `M-v` はページ移動の追加ショートカットとして提供しています。VS CodeがWebviewからのキーを転送する仕組みに合わせ、Control／Alt操作は拡張コマンドへ集約して二重移動を防いでいます（[VS Code実装](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/pre/index.html)）。

## コマンド

| コマンド | 動作 |
| --- | --- |
| Undo Tree: Visualize History / Visualize | 専用のツリー画面を開く |
| Undo Tree: Visualize as Text | Emacs風のテキスト表示を開く |
| Undo Tree: Visualize with Emacs Keys | Emacsキーバインドを有効にして開く |
| Undo Tree: Show Sidebar | Explorer内の履歴を開く |
| Undo Tree: Undo / Redo | 履歴を戻る／進む |
| Undo Tree: Switch Branch | 2枝なら切り替え、3枝以上なら選択。次のRedo先のみを変更 |
| Undo Tree: Select Previous / Next Redo Branch | Redo枝を左右に切り替える |
| Undo Tree: Undo to Previous / Redo to Next Branch Point | 分岐点まで移動 |
| Undo Tree: Save State to Register | 1文字の名前に現在の状態を保存 |
| Undo Tree: Restore State from Register | 同じファイルのレジスタに保存した状態へ戻る |
| Undo Tree: Save History / Load History | ファイルの履歴を拡張用ストレージに保存／読み込み |
| Undo Tree: Restore This State | サイドバーで選んだ状態を復元 |
| Undo Tree: Compare with Current File | 選んだ状態と現在のファイルの差分を表示 |

## 設定と保存

| 設定 | 初期値 | 意味 |
| --- | --- | --- |
| `undoTree.overrideStandardUndo` | `true` | 通常のUndo／RedoキーをUndo Treeに割り当てる |
| `undoTree.autoSaveHistory` | `true` | ファイル保存・ドキュメント終了・拡張終了時に履歴を保存し、次回開く際に読み込む |
| `undoTree.visualizerKeybindings` | `standard` | ツリーの既定キー操作。`emacs`でEmacsモード |
| `undoTree.visualizerStyle` | `graphical` | ツリーの既定表示。`text`でテキスト表示 |
| `undoTree.groupDelay` | `600` | 連続編集をまとめる間隔（ミリ秒）。`0`なら編集イベントごとに記録 |
| `undoTree.maxNodes` | `200` | ファイルごとの履歴数の目安。現在の状態と最後のUndoの保護により超える場合があります |
| `undoTree.maxFileSize` | `1000000` | 追跡する最大サイズ（UTF-16コード単位） |

履歴は全文スナップショットではなく、初期本文と変更差分で保持します。保存された履歴には過去の本文を復元できるデータが含まれます。保存先は拡張のglobal storage内の `histories` フォルダで、ファイルURIをハッシュ化した名前のJSONを使います。Emacsの `.~undo-tree~` ファイルとの互換性はありません。

保存された内容のSHA-1が開いたドキュメントと一致する場合だけ読み込みます。外部で変更されたファイルに古い履歴を当てはめることはありません。未保存のUntitledファイルは永続化せず、レジスタもセッション内のみです。
