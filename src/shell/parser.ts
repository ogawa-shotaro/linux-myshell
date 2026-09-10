export interface Line {
  name: string;
  args: string[];
  redirect?: { append: boolean; file: string };
}

/**
 * `cmd arg > file.txt` の一行を、コマンド名・引数・リダイレクト先に分解する。
 * リダイレクトは「コマンドの出力を、別のファイルへ書き込む」だけの機能であり、
 * Linux では標準出力すら「開かれたファイル」の一つに過ぎないことを表している。
 */
export function parseLine(line: string): Line {
  const tokens = line.split(/\s+/);
  let redirect: Line["redirect"];
  const idx = tokens.findIndex((t) => t === ">" || t === ">>");
  if (idx !== -1) {
    redirect = { append: tokens[idx] === ">>", file: tokens[idx + 1] };
    tokens.splice(idx);
  }
  const [name, ...args] = tokens;
  return { name, args, redirect };
}
