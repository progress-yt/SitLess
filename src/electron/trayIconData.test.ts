import { describe, expect, it } from 'vitest';
import { FALLBACK_TRAY_ICON_DATA_URL } from './trayIconData';

describe('fallback tray icon', () => {
  it('is a complete PNG data URL', () => {
    const prefix = 'data:image/png;base64,';
    expect(FALLBACK_TRAY_ICON_DATA_URL.startsWith(prefix)).toBe(true);

    const png = Buffer.from(FALLBACK_TRAY_ICON_DATA_URL.slice(prefix.length), 'base64');
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

    const chunks: string[] = [];
    let offset = 8;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.subarray(offset + 4, offset + 8).toString('ascii');
      chunks.push(type);
      offset += 12 + length;
    }

    expect(chunks).toContain('IDAT');
    expect(chunks.at(-1)).toBe('IEND');
    expect(offset).toBe(png.length);
  });
});
