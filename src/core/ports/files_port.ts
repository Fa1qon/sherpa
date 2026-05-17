// src/core/ports/files_port.ts

export interface DirEntry {
  readonly name: string;
  readonly relPath: string; // posix-style relative to project root, no leading slash
  readonly kind: 'file' | 'directory';
}

export interface FilesPort {
  /** Returns entries in <projectPath>/<relPath>. Validates relPath stays inside project root. */
  readDir(projectPath: string, relPath: string): Promise<DirEntry[]>;
  /** Reads file content; UTF-8. Validates path. */
  readFile(projectPath: string, relPath: string): Promise<string>;
  /** Writes UTF-8 content to file. Validates path stays inside project root. */
  writeFile(projectPath: string, relPath: string, content: string): Promise<void>;
  /** Reads file as base64 string (for binary files — images etc.). Validates path. */
  readBinary(projectPath: string, relPath: string): Promise<string>;
}
