# linux-myshell

Linux の core concept ——「**すべてはファイルである (Everything is a file)**」——
を手を動かして体感するための、TypeScript 製の仮想シェルです。

実ディスクには触れません。メモリ上に構築した仮想ファイルシステム（VFS）の上で、
`ls` `cd` `cat` などおなじみのコマンドが動きます。

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
ディレクトリツリー全体を表現しています。これは Linux の VFS (仮想ファイルシステム) を
かなり忠実に縮小したモデルです。

## セットアップ・実行

```sh
npm install
npm start
```

## 試してみてほしいこと

```sh
tree /                      # ファイルシステムが木構造であることを一望する
cat /proc/cpuinfo           # 「CPU情報」もただのファイルとして読める
echo hello > /dev/null      # 何を書いても消える「ブラックホール」ファイル
cat /proc/uptime            # 読むたびに値が変わる「動くファイル」
ln -s /etc/hostname /tmp/h  # シンボリックリンクもファイルの一種
stat /etc/passwd            # inode番号・パーミッション・所有者を確認
cat /proc/cpuinfo | grep model
```

## コマンド一覧

`pwd` `ls` `cd` `cat` `echo` `mkdir` `touch` `rm` `cp` `mv` `ln` `chmod`
`stat` `tree` `find` `grep` `whoami` `id` `uname` `help` `clear` `exit`

パイプ (`|`) とリダイレクト (`>` `>>`) にも対応しています。

## ディレクトリ構成

```
src/
  fs/
    types.ts        inode の型定義（Everything is a file の核）
    filesystem.ts    VFS 本体（パス解決・作成・削除・読み書き）
    seed.ts          初期ツリーと /dev, /proc の疑似ファイルを構築
  shell/
    parser.ts        パイプ・リダイレクトの簡易パーサ
    commands.ts      各コマンドの実装
    shell.ts         REPL（対話ループ）
  index.ts           エントリポイント
```
