import { describe, expect, it } from 'vitest';
import { BUILT_IN_REMINDER_IMAGES, DEFAULT_BUILT_IN_REMINDER_IMAGE_ID, createDefaultSettings, createFallbackDailyPoem } from './defaults';

describe('fallback daily poem', () => {
  it('rotates by date when the remote poem service is unavailable', () => {
    expect(createFallbackDailyPoem('2026-06-08').content).not.toBe(createFallbackDailyPoem('2026-06-09').content);
  });
});

describe('default reminder images', () => {
  it('ships with two selectable built-in images', () => {
    expect(BUILT_IN_REMINDER_IMAGES).toHaveLength(2);
    expect(new Set(BUILT_IN_REMINDER_IMAGES.map((image) => image.id)).size).toBe(2);
  });

  it('uses the default built-in image when no custom image is selected', () => {
    const settings = createDefaultSettings();

    expect(settings.customReminderImagePath).toBeNull();
    expect(settings.builtInReminderImageId).toBe(DEFAULT_BUILT_IN_REMINDER_IMAGE_ID);
  });
});
