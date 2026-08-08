import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendRotatingLog, redactLocalPaths } from './diagnosticLogFile';

describe('diagnostic log files', () => {
  it('rotates the current log before it exceeds the configured limit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sitless-log-'));
    const logPath = join(directory, 'sitless.log');
    writeFileSync(logPath, '12345', 'utf8');

    appendRotatingLog(logPath, '6789', 8);

    expect(readFileSync(join(directory, 'sitless.1.log'), 'utf8')).toBe('12345');
    expect(readFileSync(logPath, 'utf8')).toBe('6789');
  });

  it('redacts local paths case-insensitively', () => {
    const output = redactLocalPaths(
      'C:\\Users\\Me\\AppData\\SitLess\\settings.json C:/Users/Me/Desktop',
      ['C:\\Users\\Me\\AppData\\SitLess', 'C:\\Users\\Me']
    );

    expect(output).toBe('<userData>\\settings.json <userHome>/Desktop');
  });
});
