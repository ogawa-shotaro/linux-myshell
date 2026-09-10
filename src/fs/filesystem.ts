import type { DeviceInode, DirInode, FileInode, Inode, SymlinkInode } from "./types.js";

export class FsError extends Error {}

/** パスを正規化する。cwd を基準に "." "..", 絶対/相対パスを解決する。 */
export function normalizePath(cwd: string, path: string): string {
  const base = path.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  const parts = base.concat(path.split("/").filter(Boolean));
  const stack: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return "/" + stack.join("/");
}

/**
 * Linux のファイルシステム全体を「inode 番号 -> inode」の一枚のテーブルとして表現する。
 * ディレクトリツリーは実体を持たず、ディレクトリの中身（children）が
 * 「名前 -> inode番号」を指し示しているだけ、という Linux VFS の構造をそのまま模している。
 */
export class FileSystem {
  private inodes = new Map<number, Inode>();
  private nextIno = 1;
  readonly rootIno: number;

  constructor() {
    const root: DirInode = {
      ino: this.nextIno++,
      type: "dir",
      mode: "rwxr-xr-x",
      owner: "root",
      group: "root",
      createdAt: new Date(),
      modifiedAt: new Date(),
      children: new Map(),
    };
    this.inodes.set(root.ino, root);
    this.rootIno = root.ino;
  }

  private alloc<T extends Inode>(inode: Omit<T, "ino">): T {
    const full = { ...inode, ino: this.nextIno++ } as T;
    this.inodes.set(full.ino, full);
    return full;
  }

  getInode(ino: number): Inode {
    const inode = this.inodes.get(ino);
    if (!inode) throw new FsError(`inode ${ino} が見つかりません`);
    return inode;
  }

  private asDir(inode: Inode, path: string): DirInode {
    if (inode.type !== "dir") throw new FsError(`${path}: ディレクトリではありません`);
    return inode;
  }

  /**
   * パスを辿って inode 番号を返す。シンボリックリンクは既定で辿る（透過的に解決する）。
   * これが「パス文字列」と「実体(inode)」を結びつける、ファイルシステムの中心的な処理。
   */
  resolve(path: string, opts: { followSymlink?: boolean; depth?: number } = {}): number {
    const followSymlink = opts.followSymlink ?? true;
    const depth = opts.depth ?? 0;
    if (depth > 40) throw new FsError("シンボリックリンクの参照が深すぎます");

    const segments = path.split("/").filter(Boolean);
    let currentIno = this.rootIno;

    for (let i = 0; i < segments.length; i++) {
      const name = segments[i];
      const dir = this.asDir(this.getInode(currentIno), path);
      const childIno = dir.children.get(name);
      if (childIno === undefined) {
        throw new FsError(`${path}: そのようなファイルやディレクトリはありません`);
      }
      const isLast = i === segments.length - 1;
      const child = this.getInode(childIno);
      if (child.type === "symlink" && (!isLast || followSymlink)) {
        const target = child.target.startsWith("/")
          ? child.target
          : normalizePath("/" + segments.slice(0, i).join("/"), child.target);
        currentIno = this.resolve(target, { followSymlink: true, depth: depth + 1 });
      } else {
        currentIno = childIno;
      }
    }
    return currentIno;
  }

  exists(path: string): boolean {
    try {
      this.resolve(path);
      return true;
    } catch {
      return false;
    }
  }

  stat(path: string, followSymlink = true): Inode {
    return this.getInode(this.resolve(path, { followSymlink }));
  }

  private splitParent(path: string): { parentPath: string; name: string } {
    const idx = path.lastIndexOf("/");
    const parentPath = idx <= 0 ? "/" : path.slice(0, idx);
    const name = path.slice(idx + 1);
    if (!name) throw new FsError(`${path}: 不正なパスです`);
    return { parentPath, name };
  }

  mkdir(path: string, mkParents = false): void {
    if (path === "/") return;
    const { parentPath, name } = this.splitParent(path);
    if (mkParents && !this.exists(parentPath)) this.mkdir(parentPath, true);
    const parentIno = this.resolve(parentPath);
    const parent = this.asDir(this.getInode(parentIno), parentPath);
    if (parent.children.has(name)) {
      if (mkParents) return;
      throw new FsError(`${path}: 既に存在します`);
    }
    const dir = this.alloc<DirInode>({
      type: "dir",
      mode: "rwxr-xr-x",
      owner: "guest",
      group: "guest",
      createdAt: new Date(),
      modifiedAt: new Date(),
      children: new Map(),
    });
    parent.children.set(name, dir.ino);
    parent.modifiedAt = new Date();
  }

  create(path: string, content = ""): FileInode {
    const { parentPath, name } = this.splitParent(path);
    const parentIno = this.resolve(parentPath);
    const parent = this.asDir(this.getInode(parentIno), parentPath);
    if (parent.children.has(name)) {
      throw new FsError(`${path}: 既に存在します`);
    }
    const file = this.alloc<FileInode>({
      type: "file",
      mode: "rw-r--r--",
      owner: "guest",
      group: "guest",
      createdAt: new Date(),
      modifiedAt: new Date(),
      content,
    });
    parent.children.set(name, file.ino);
    parent.modifiedAt = new Date();
    return file;
  }

  /** デバイスファイルなどカスタム inode をディレクトリに直接埋め込むための低レベル API */
  attach(parentPath: string, name: string, inode: Omit<Inode, "ino">): void {
    const parentIno = this.resolve(parentPath);
    const parent = this.asDir(this.getInode(parentIno), parentPath);
    const full = { ...inode, ino: this.nextIno++ } as Inode;
    this.inodes.set(full.ino, full);
    parent.children.set(name, full.ino);
  }

  symlink(target: string, linkPath: string): void {
    const { parentPath, name } = this.splitParent(linkPath);
    const parentIno = this.resolve(parentPath);
    const parent = this.asDir(this.getInode(parentIno), parentPath);
    const link = this.alloc<SymlinkInode>({
      type: "symlink",
      mode: "rwxrwxrwx",
      owner: "guest",
      group: "guest",
      createdAt: new Date(),
      modifiedAt: new Date(),
      target,
    });
    parent.children.set(name, link.ino);
  }

  read(path: string): string {
    const inode = this.getInode(this.resolve(path));
    if (inode.type === "dir") throw new FsError(`${path}: ディレクトリです`);
    if (inode.type === "device") return (inode as DeviceInode).read();
    return (inode as FileInode).content;
  }

  write(path: string, content: string, append = false): void {
    let ino: number;
    try {
      ino = this.resolve(path);
    } catch {
      ino = this.create(path).ino;
    }
    const inode = this.getInode(ino);
    if (inode.type === "dir") throw new FsError(`${path}: ディレクトリです`);
    if (inode.type === "device") {
      (inode as DeviceInode).write?.(content);
      return;
    }
    const file = inode as FileInode;
    file.content = append ? file.content + content : content;
    file.modifiedAt = new Date();
  }

  readdir(path: string): Array<{ name: string; ino: number }> {
    const dir = this.asDir(this.getInode(this.resolve(path)), path);
    return [...dir.children.entries()].map(([name, ino]) => ({ name, ino }));
  }

  unlink(path: string, recursive = false): void {
    const { parentPath, name } = this.splitParent(path);
    const parentIno = this.resolve(parentPath);
    const parent = this.asDir(this.getInode(parentIno), parentPath);
    const targetIno = parent.children.get(name);
    if (targetIno === undefined) throw new FsError(`${path}: そのようなファイルやディレクトリはありません`);
    const target = this.getInode(targetIno);
    if (target.type === "dir") {
      if (target.children.size > 0 && !recursive) {
        throw new FsError(`${path}: ディレクトリは空ではありません（-r を指定してください）`);
      }
      if (recursive) {
        for (const child of target.children.keys()) {
          this.unlink(path + "/" + child, true);
        }
      }
    }
    parent.children.delete(name);
    this.inodes.delete(targetIno);
    parent.modifiedAt = new Date();
  }
}
