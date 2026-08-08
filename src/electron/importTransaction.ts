import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export type ImportFiles = Record<string, Buffer>;
export type MoveFile = (source: string, destination: string) => void;

export function commitImportFiles(
  userDataPath: string,
  files: ImportFiles,
  moveFile: MoveFile = renameSync
): void {
  const stagingRoot = mkdtempSync(join(userDataPath, '.sitless-import-'));
  const nextRoot = join(stagingRoot, 'next');
  const previousRoot = join(stagingRoot, 'previous');
  const committed: Array<{ destination: string; backup: string | null }> = [];

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const stagedPath = resolveContainedPath(nextRoot, relativePath);
      mkdirSync(dirname(stagedPath), { recursive: true });
      writeFileSync(stagedPath, content);
    }

    for (const relativePath of Object.keys(files)) {
      const stagedPath = resolveContainedPath(nextRoot, relativePath);
      const destination = resolveContainedPath(userDataPath, relativePath);
      const backup = resolveContainedPath(previousRoot, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      let backupPath: string | null = null;
      if (existsSync(destination)) {
        mkdirSync(dirname(backup), { recursive: true });
        moveFile(destination, backup);
        backupPath = backup;
      }
      committed.push({ destination, backup: backupPath });
      moveFile(stagedPath, destination);
    }
  } catch (error) {
    for (const entry of [...committed].reverse()) {
      if (existsSync(entry.destination)) {
        rmSync(entry.destination, { recursive: true, force: true });
      }
      if (entry.backup && existsSync(entry.backup)) {
        mkdirSync(dirname(entry.destination), { recursive: true });
        moveFile(entry.backup, entry.destination);
      }
    }
    throw error;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function resolveContainedPath(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, candidate);
  const pathFromRoot = relative(resolvedRoot, resolvedPath);
  if (!pathFromRoot || pathFromRoot.startsWith('..') || resolve(pathFromRoot) === pathFromRoot) {
    throw new Error(`无效的导入路径: ${candidate}`);
  }
  return resolvedPath;
}
