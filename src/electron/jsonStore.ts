import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    const backupPath = `${filePath}.bak`;
    if (!existsSync(backupPath)) {
      return fallback;
    }
    try {
      const recovered = JSON.parse(readFileSync(backupPath, 'utf8')) as T;
      try {
        copyFileSync(backupPath, filePath);
      } catch {
        // The backup is still usable when the damaged primary cannot be replaced.
      }
      return recovered;
    } catch {
      return fallback;
    }
  }
}

export function writeJsonFile<T>(filePath: string, value: T): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  copyFileSync(tempPath, `${filePath}.bak`);
  renameSync(tempPath, filePath);
}
