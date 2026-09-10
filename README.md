# linux-myshell

Linux の core concept ——「**すべてはファイルである (Everything is a file)**」——
を理解するための、最小構成の TypeScript 製仮想シェルです。

実ディスクには触れません。メモリ上に構築した仮想ファイルシステム（VFS）の上で、
`ls` `cd` `cat` などのコマンドが動きます。理解に不要な機能はそぎ落としてあります。

## なぜファイルシステムなのか

Linux では次のようなものが、すべて同じ「inode」という仕組みで表現されます。

| もの | このリポジトリでの実装 |
|---|---|
| 普通のファイル・ディレクトリ | `src/fs/types.ts` の `FileInode` / `DirInode` |
| デバイス（`/dev/null` など） | アクセスされるたびに関数が実行される `DeviceInode` |
| カーネル/プロセスの情報（`/proc/cpuinfo` など） | 同じく `DeviceInode`。読むたびに動的生成 |
| ショートカット（`ln -s`） | パス文字列を持つだけの `SymlinkInode` |

`src/fs/filesystem.ts` の `FileSystem` クラスは、`Map<inode番号, inode>` という
一枚のテーブルと、ディレクトリが持つ「名前 → inode番号」の対応表だけで
ディレクトリツリー全体を表現しています。これが Linux の VFS (仮想ファイルシステム) を
縮小したモデルです。

## セットアップ・実行

```sh
npm install
npm start
```

## 試してみてほしいこと

```sh
tree /                          # ファイルシステムが木構造であることを一望する
cat /proc/cpuinfo               # 「CPU情報」もただのファイルとして読める
echo hello > /dev/null          # 何を書いても消える「ブラックホール」ファイル
cat /dev/null                   # 何も出てこない
cat /proc/uptime                # 読むたびに値が変わる「動くファイル」（もう一度打つと値が変わる）
ln -s /etc/hostname /tmp/h      # シンボリックリンクもファイルの一種
cat /tmp/h                      # リンク越しに実体の中身が読める
stat /etc/passwd                # inode番号・パーミッション・所有者を確認
ls -l /                         # d(ディレクトリ) l(リンク) -(ファイル) c(デバイス) が並ぶ
```

## コマンド一覧（理解に必要な最低限だけ）

`pwd` `ls` `cd` `cat` `echo` `mkdir` `touch` `rm` `ln` `stat` `tree` `help` `exit`

リダイレクト (`>` `>>`) にのみ対応しています。パイプや `cp` `mv` `chmod` などの
周辺コマンドは、ファイルシステムの理解には必須ではないため実装していません。

## ディレクトリ構成

```
src/
  fs/
    types.ts        inode の型定義（Everything is a file の核）
    filesystem.ts    VFS 本体（パス解決・作成・削除・読み書き）
    seed.ts          初期ツリーと /dev, /proc の疑似ファイルを構築
  shell/
    parser.ts        1行をコマンド名・引数・リダイレクト先に分解する
    commands.ts      各コマンドの実装
    shell.ts         REPL（対話ループ）
  index.ts           エントリポイント
```

## コードを読む順序

1. `src/fs/types.ts` — 4種類の inode（file / dir / symlink / device）が共通の型を持つ様子
2. `src/fs/seed.ts` — `/dev/null` や `/proc/uptime` が関数として実装されている様子
3. `src/fs/filesystem.ts` の `resolve()` — パス文字列からinodeを辿る処理、シンボリックリンクの解決
4. `src/shell/commands.ts` の `cat` — inodeの種類ごとに分岐しているだけの薄い実装
