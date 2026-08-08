import { appendFileSync, copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const MAX_DIAGNOSTIC_LOG_BYTES = 512 * 1024;

export function appendRotatingLog(
  logPath: string,
  line: string,
  maxBytes = MAX_DIAGNOSTIC_LOG_BYTES
): void {
  const lineBytes = Buffer.byteLength(line, 'utf8');
  if (existsSync(logPath) && statSync(logPath).size + lineBytes > maxBytes) {
    copyFileSync(logPath, join(dirname(logPath), 'sitless.1.log'));
    writeFileSync(logPath, '', 'utf8');
  }
  appendFileSync(logPath, line, 'utf8');
}

export function redactLocalPaths(value: string, paths: string[]): string {
  return paths.reduce((redacted, path, index) => {
    if (!path) {
      return redacted;
    }
    const placeholder = index === 0 ? '<userData>' : '<userHome>';
    return replaceLiteralIgnoreCase(
      replaceLiteralIgnoreCase(redacted, path, placeholder),
      path.replace(/\\/g, '/'),
      placeholder
    );
  }, value);
}

function replaceLiteralIgnoreCase(value: string, search: string, replacement: string): string {
  if (!search) {
    return value;
  }
  return value.replace(new RegExp(escapeRegExp(search), 'gi'), replacement);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
