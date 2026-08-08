import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJsonFile, writeJsonFile } from './jsonStore';

const tempDirectories: string[] = [];

afterEach(() => {
  tempDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('JSON store recovery', () => {
  it('keeps a current backup and restores a damaged primary file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sitless-json-'));
    tempDirectories.push(directory);
    const filePath = join(directory, 'settings.json');
    writeJsonFile(filePath, { version: 1 });
    writeJsonFile(filePath, { version: 2 });

    expect(JSON.parse(readFileSync(`${filePath}.bak`, 'utf8'))).toEqual({ version: 2 });
    writeFileSync(filePath, '{broken', 'utf8');

    expect(readJsonFile(filePath, { version: 0 })).toEqual({ version: 2 });
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ version: 2 });
  });
});
