export interface Stage {
  name: string;
  args: string[];
  redirect?: { append: boolean; file: string };
}

/**
 * `cmd1 arg | cmd2 arg > file.txt` のような一行を、パイプでつながれた
 * 複数ステージに分解する。パイプもリダイレクトも、実体は
 * 「あるコマンドの出力を、別のファイル（またはファイル記述子）へ書き込む」だけの機能であり、
 * Linux ではパイプ自体も一種の特殊ファイルとして扱われる。
 */
export function parseLine(line: string): Stage[] {
  return line
    .split("|")
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0)
    .map((raw) => {
      const tokens = raw.split(/\s+/);
      let redirect: Stage["redirect"];
      const idx = tokens.findIndex((t) => t === ">" || t === ">>");
      if (idx !== -1) {
        redirect = { append: tokens[idx] === ">>", file: tokens[idx + 1] };
        tokens.splice(idx);
      }
      const [name, ...args] = tokens;
      return { name, args, redirect };
    });
}
