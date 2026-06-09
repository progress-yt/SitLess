import { describe, expect, it } from 'vitest';
import { createFallbackDailyPoem } from './defaults';

describe('fallback daily poem', () => {
  it('rotates by date when the remote poem service is unavailable', () => {
    expect(createFallbackDailyPoem('2026-06-08').content).not.toBe(createFallbackDailyPoem('2026-06-09').content);
  });
});
