import { FsError, FileSystem, normalizePath } from "../fs/filesystem.js";
import { typeChar, type Inode } from "../fs/types.js";

export interface ShellContext {
  fs: FileSystem;
  cwd: string;
  user: string;
  exit: boolean;
}

export type Command = (ctx: ShellContext, args: string[]) => string;

function resolvePath(ctx: ShellContext, path: string): string {
  return normalizePath(ctx.cwd, path);
}

function sizeOf(inode: Inode): number {
  if (inode.type === "file") return inode.content.length;
  if (inode.type === "dir") return inode.children.size;
  if (inode.type === "symlink") return inode.target.length;
  return 0; // device: 読むたびに値が変わるので固定サイズは無い
}

function formatLs(name: string, inode: Inode): string {
  const t = typeChar(inode.type);
  const link = inode.type === "symlink" ? ` -> ${inode.target}` : "";
  return `${t}${inode.mode} ${inode.owner.padEnd(5)} ${inode.group.padEnd(5)} ${String(sizeOf(inode)).padStart(6)}  ${name}${link}`;
}

export const commands: Record<string, Command> = {
  pwd: (ctx) => ctx.cwd + "\n",

  echo: (_ctx, args) => args.join(" ") + "\n",

  ls: (ctx, args) => {
    const long = args.includes("-l");
    const target = args.find((a) => !a.startsWith("-")) ?? ".";
    const path = resolvePath(ctx, target);
    const entries = ctx.fs.readdir(path).sort((a, b) => a.name.localeCompare(b.name));
    if (!long) return entries.map((e) => e.name).join("  ") + (entries.length ? "\n" : "");
    return entries.map((e) => formatLs(e.name, ctx.fs.getInode(e.ino))).join("\n") + "\n";
  },

  cd: (ctx, args) => {
    const target = args[0] ?? "/home/guest";
    const path = resolvePath(ctx, target);
    const inode = ctx.fs.stat(path);
    if (inode.type !== "dir") throw new FsError(`cd: ${target}: ディレクトリではありません`);
    ctx.cwd = path;
    return "";
  },

  cat: (ctx, args) => args.map((a) => ctx.fs.read(resolvePath(ctx, a))).join(""),

  mkdir: (ctx, args) => {
    const parents = args.includes("-p");
    for (const a of args.filter((a) => a !== "-p")) {
      ctx.fs.mkdir(resolvePath(ctx, a), parents);
    }
    return "";
  },

  touch: (ctx, args) => {
    for (const a of args) {
      const path = resolvePath(ctx, a);
      if (ctx.fs.exists(path)) {
        ctx.fs.getInode(ctx.fs.stat(path).ino).modifiedAt = new Date();
      } else {
        ctx.fs.create(path);
      }
    }
    return "";
  },

  rm: (ctx, args) => {
    const recursive = args.includes("-r");
    for (const a of args.filter((a) => a !== "-r")) {
      ctx.fs.unlink(resolvePath(ctx, a), recursive);
    }
    return "";
  },

  ln: (ctx, args) => {
    if (args[0] !== "-s") throw new FsError("ln: このシェルはシンボリックリンク（ln -s）のみ対応しています");
    const [, target, linkName] = args;
    if (!target || !linkName) throw new FsError("ln: リンク先とリンク名を指定してください");
    ctx.fs.symlink(target, resolvePath(ctx, linkName));
    return "";
  },

  stat: (ctx, args) => {
    const path = resolvePath(ctx, args[0] ?? ".");
    const inode = ctx.fs.stat(path);
    return (
      `File: ${path}\n` +
      `Inode: ${inode.ino}\tType: ${inode.type}\tSize: ${sizeOf(inode)}\n` +
      `Mode: ${typeChar(inode.type)}${inode.mode}\tOwner: ${inode.owner}\tGroup: ${inode.group}\n` +
      `Modify: ${inode.modifiedAt.toISOString()}\n`
    );
  },

  tree: (ctx, args) => {
    const start = resolvePath(ctx, args[0] ?? ".");
    const lines: string[] = [start];
    const walk = (path: string, prefix: string) => {
      const entries = ctx.fs.readdir(path).sort((a, b) => a.name.localeCompare(b.name));
      entries.forEach((e, i) => {
        const last = i === entries.length - 1;
        const inode = ctx.fs.getInode(e.ino);
        lines.push(`${prefix}${last ? "└── " : "├── "}${e.name}${inode.type === "dir" ? "/" : ""}`);
        if (inode.type === "dir") walk(path + "/" + e.name, prefix + (last ? "    " : "│   "));
      });
    };
    walk(start, "");
    return lines.join("\n") + "\n";
  },

  help: () =>
    Object.keys(commands).sort().join("  ") + "\n\nリダイレクト ( > , >> ) が使えます。例: echo hi > /tmp/a.txt\n",

  exit: (ctx) => {
    ctx.exit = true;
    return "";
  },
};
