import { FileSystem } from "./filesystem.js";
import type { DeviceInode } from "./types.js";

const bootTime = Date.now();

function device(read: () => string, write?: (data: string) => void): Omit<DeviceInode, "ino"> {
  return {
    type: "device",
    mode: "rw-rw-rw-",
    owner: "root",
    group: "root",
    createdAt: new Date(),
    modifiedAt: new Date(),
    read,
    write,
  };
}

/**
 * 初期ファイルシステムを構築する。
 * ここで実際の Linux にならって /bin /etc /home /proc /dev を用意することで、
 * 「設定もプロセス情報もデバイスも、全部ただのファイルだ」という感覚をリポジトリ全体で体験できるようにする。
 */
export function seedFileSystem(): FileSystem {
  const fs = new FileSystem();

  for (const dir of ["/bin", "/etc", "/home", "/home/guest", "/tmp", "/var", "/var/log", "/dev", "/proc", "/root"]) {
    fs.mkdir(dir);
  }
  // /etc, /bin, /root は本物の Linux と同じく root の持ち物にする
  for (const dir of ["/bin", "/etc", "/root"]) {
    const inode = fs.getInode(fs.stat(dir).ino);
    inode.owner = "root";
    inode.group = "root";
  }

  // --- /etc: 設定「ファイル」たち ---
  const asRoot = (path: string) => {
    const inode = fs.getInode(fs.stat(path).ino);
    inode.owner = "root";
    inode.group = "root";
  };
  fs.create("/etc/hostname", "myshell\n");
  fs.create("/etc/os-release", 'NAME="MyShell Linux"\nVERSION="1.0"\nID=myshell\n');
  fs.create(
    "/etc/passwd",
    "root:x:0:0:root:/root:/bin/myshell\nguest:x:1000:1000:guest:/home/guest:/bin/myshell\n"
  );
  fs.create("/etc/motd", "MyShell へようこそ。Linux は「すべてがファイル」でできている。\n");
  for (const name of ["hostname", "os-release", "passwd", "motd"]) asRoot(`/etc/${name}`);

  // --- /home/guest: 通常のユーザーファイル ---
  fs.create(
    "/home/guest/README.txt",
    "これは普通のテキストファイルです。\ncat, echo, mkdir, rm などのコマンドを試してみてください。\n"
  );
  fs.symlink("/home/guest/README.txt", "/home/guest/readme_link");

  // --- /dev: デバイスファイル。read/write のたびに関数が動く「動くファイル」 ---
  fs.attach(
    "/dev",
    "null",
    device(
      () => "",
      () => {
        /* 何を書いても捨てられる：ブラックホールとしてのファイル */
      }
    )
  );
  fs.attach("/dev", "zero", device(() => "\0".repeat(64)));
  fs.attach("/dev", "random", device(() => Math.random().toString(36).slice(2)));

  // --- /proc: カーネルやプロセスの状態が「ファイルのふり」をして見えている領域 ---
  fs.attach(
    "/proc",
    "version",
    device(() => `MyShell version 1.0 (typescript) #1 ${new Date().toDateString()}\n`)
  );
  fs.attach(
    "/proc",
    "uptime",
    device(() => `${((Date.now() - bootTime) / 1000).toFixed(2)}\n`)
  );
  fs.attach(
    "/proc",
    "cpuinfo",
    device(() => "processor\t: 0\nmodel name\t: Virtual MyShell CPU\ncores\t\t: 1\n")
  );
  fs.attach(
    "/proc",
    "meminfo",
    device(() => {
      const mem = process.memoryUsage();
      return `MemTotal:  ${Math.round(mem.rss / 1024)} kB\nMemUsed:   ${Math.round(mem.heapUsed / 1024)} kB\n`;
    })
  );

  return fs;
}
