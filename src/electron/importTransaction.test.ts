import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commitImportFiles } from './importTransaction';

const directories: string[] = [];

afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('import transaction', () => {
  it('commits every staged file together', () => {
    const root = createRoot();
    commitImportFiles(root, {
      'settings.json': Buffer.from('new-settings'),
      'images/reminder.png': Buffer.from('new-image')
    });

    expect(readFileSync(join(root, 'settings.json'), 'utf8')).toBe('new-settings');
    expect(readFileSync(join(root, 'images/reminder.png'), 'utf8')).toBe('new-image');
  });

  it('restores all original files when a later replacement fails', () => {
    const root = createRoot();
    mkdirSync(join(root, 'images'), { recursive: true });
    writeFileSync(join(root, 'settings.json'), 'old-settings');
    writeFileSync(join(root, 'images/reminder.png'), 'old-image');
    let moves = 0;

    expect(() => commitImportFiles(root, {
      'settings.json': Buffer.from('new-settings'),
      'images/reminder.png': Buffer.from('new-image')
    }, (source, destination) => {
      moves += 1;
      if (moves === 4) {
        throw new Error('simulated failure');
      }
      renameSync(source, destination);
    })).toThrow('simulated failure');

    expect(readFileSync(join(root, 'settings.json'), 'utf8')).toBe('old-settings');
    expect(readFileSync(join(root, 'images/reminder.png'), 'utf8')).toBe('old-image');
  });
});

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'sitless-import-'));
  directories.push(root);
  return root;
}
