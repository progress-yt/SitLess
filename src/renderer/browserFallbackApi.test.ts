import { describe, expect, it } from 'vitest';
import { createBrowserFallbackApi } from './browserFallbackApi';

describe('browser fallback API', () => {
  it('emits state-changing snapshots and stops after unsubscribe', async () => {
    const api = createBrowserFallbackApi();
    const initial = await api.getSnapshot();
    const snapshots = [] as Array<typeof initial>;
    const unsubscribe = api.onSnapshot((snapshot) => snapshots.push(snapshot));

    await api.updateSettings({
      ...initial.settings,
      snoozeMinutes: 27
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].settings.snoozeMinutes).toBe(27);

    unsubscribe();
    await api.updateSettings({
      ...initial.settings,
      snoozeMinutes: 28
    });

    expect(snapshots).toHaveLength(1);
  });
});
