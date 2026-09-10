// Linux は「すべてがファイルである (Everything is a file)」という思想を持つ。
// 通常のファイルだけでなく、ディレクトリ・デバイス・シンボリックリンクも
// すべて同じ「inode」というデータ構造で表現する。この型定義がその核心。

export type FileType = "file" | "dir" | "symlink" | "device";

export interface InodeBase {
  ino: number; // inode 番号。ファイルの「実体」を指す一意な ID
  type: FileType;
  mode: string; // 例: "rwxr-xr-x"（表示用パーミッション）
  owner: string;
  group: string;
  createdAt: Date;
  modifiedAt: Date;
}

/** 普通のファイル。中身はただの文字列（バイト列の代わり） */
export interface FileInode extends InodeBase {
  type: "file";
  content: string;
}

/** ディレクトリも「ファイル名 -> inode番号」の対応表を中身に持つファイルに過ぎない */
export interface DirInode extends InodeBase {
  type: "dir";
  children: Map<string, number>;
}

/** シンボリックリンク。中身は「リンク先のパス文字列」だけ */
export interface SymlinkInode extends InodeBase {
  type: "symlink";
  target: string;
}

/**
 * デバイスファイル。/dev や /proc 以下のファイルがこれにあたる。
 * read/write を関数として持ち、アクセスされるたびに動的に値を生成する。
 * カーネルやハードウェアが「ファイルのふりをしてデータを提供する」仕組みの再現。
 */
export interface DeviceInode extends InodeBase {
  type: "device";
  read: () => string;
  write?: (data: string) => void;
}

export type Inode = FileInode | DirInode | SymlinkInode | DeviceInode;

export function typeChar(type: FileType): string {
  switch (type) {
    case "dir":
      return "d";
    case "symlink":
      return "l";
    case "device":
      return "c";
    default:
      return "-";
  }
}
