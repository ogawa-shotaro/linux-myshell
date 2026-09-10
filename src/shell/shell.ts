import readline from "node:readline";
import { FsError } from "../fs/filesystem.js";
import { seedFileSystem } from "../fs/seed.js";
import { commands, type ShellContext } from "./commands.js";
import { parseLine } from "./parser.js";

const BANNER = `MyShell — Linux の「すべてはファイルである」を体験するための仮想シェル
help でコマンド一覧、exit で終了します。
`;

/** 1行分のコマンドを実行し、標準出力に相当する文字列を返す */
function runLine(ctx: ShellContext, line: string): string {
  const { name, args, redirect } = parseLine(line);
  const command = commands[name];
  if (!command) throw new FsError(`${name}: コマンドが見つかりません`);
  const output = command(ctx, args);
  if (!redirect) return output;
  const path = redirect.file.startsWith("/") ? redirect.file : `${ctx.cwd}/${redirect.file}`;
  ctx.fs.write(path, output, redirect.append);
  return "";
}

export function startShell(): void {
  const ctx: ShellContext = { fs: seedFileSystem(), cwd: "/home/guest", user: "guest", exit: false };
  process.stdout.write(BANNER);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => `${ctx.user}@myshell:${ctx.cwd}$ `;
  rl.setPrompt(prompt());
  rl.prompt();

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      try {
        const output = runLine(ctx, trimmed);
        if (output) process.stdout.write(output.endsWith("\n") ? output : output + "\n");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stdout.write(message + "\n");
      }
    }
    if (ctx.exit) {
      rl.close();
      return;
    }
    rl.setPrompt(prompt());
    rl.prompt();
  });

  rl.on("close", () => {
    process.stdout.write("さようなら\n");
    process.exit(0);
  });
}
