import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readValidatedReminderImage, validateReminderImage } from './reminderImageValidation';

const directories: string[] = [];

afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('reminder image validation', () => {
  it('checks bitmap signatures instead of trusting extensions', () => {
    expect(validateReminderImage('.png', pngBytes())).toBe(true);
    expect(validateReminderImage('.png', Buffer.from('not-a-png'))).toBe(false);
  });

  it('rejects active content in SVG images', () => {
    expect(validateReminderImage('.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'))).toBe(true);
    expect(validateReminderImage('.svg', Buffer.from('<svg onload="alert(1)"><script>alert(1)</script></svg>'))).toBe(false);
  });

  it('checks size before accepting a local image', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sitless-image-validation-'));
    directories.push(directory);
    const filePath = join(directory, 'reminder.png');
    writeFileSync(filePath, pngBytes());

    expect(readValidatedReminderImage(filePath).extension).toBe('.png');
    expect(() => readValidatedReminderImage(filePath, 4)).toThrow('超过大小限制');
  });
});

function pngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}
