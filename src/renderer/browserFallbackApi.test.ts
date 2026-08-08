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

  it('merges settings patches and ignores protected fields at runtime', async () => {
    const api = createBrowserFallbackApi();
    const initial = await api.getSnapshot();

    const updated = await api.updateSettings({
      snoozeMinutes: 27,
      customReminderImagePath: 'C:\\Windows\\win.ini'
    } as never);

    expect(updated.snoozeMinutes).toBe(27);
    expect(updated.activeThresholdMinutes).toBe(initial.settings.activeThresholdMinutes);
    expect(updated.customReminderImagePath).toBeNull();
  });

  it('loads history separately from realtime snapshots', async () => {
    const history = await createBrowserFallbackApi().getHistory();

    expect(history.dailyRecords).toHaveLength(1);
    expect(history.trend).toHaveLength(14);
  });

  it('emits update state events and supports unsubscribe', async () => {
    const api = createBrowserFallbackApi();
    const states = [] as Awaited<ReturnType<typeof api.getUpdateState>>[];
    const unsubscribe = api.onUpdateState((state) => states.push(state));

    await api.checkForUpdates();
    unsubscribe();
    await api.checkForUpdates();

    expect(states).toHaveLength(1);
    expect(states[0].status).toBe('unavailable');
  });
});
