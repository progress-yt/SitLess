import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings } from '../shared/defaults';
import type { AppSettings } from '../shared/types';
import { StartupPreferences } from './startupPreferences';
import type { ReminderWindows } from './reminderWindows';

const electronMock = vi.hoisted(() => ({
  setLoginItemSettings: vi.fn()
}));

vi.mock('electron', () => ({
  app: { setLoginItemSettings: electronMock.setLoginItemSettings }
}));

describe('StartupPreferences', () => {
  beforeEach(() => {
    electronMock.setLoginItemSettings.mockReset();
  });

  it('persists the first-launch choice and applies it to Windows login', async () => {
    const harness = createHarness(0);

    await harness.preferences.maybeAsk();

    expect(harness.windows.showMessageBox).toHaveBeenCalledOnce();
    expect(harness.settings.launchAtStartup).toBe(true);
    expect(harness.settings.hasSeenStartupPrompt).toBe(true);
    expect(electronMock.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
    expect(harness.onChange).toHaveBeenCalledOnce();
  });

  it('does not ask again after the startup choice has been seen', async () => {
    const harness = createHarness(0, { hasSeenStartupPrompt: true });

    await harness.preferences.maybeAsk();

    expect(harness.windows.showMessageBox).not.toHaveBeenCalled();
    expect(harness.onChange).not.toHaveBeenCalled();
  });
});

function createHarness(response: number, patch: Partial<AppSettings> = {}) {
  let settings = { ...createDefaultSettings(), ...patch };
  const settingsStore = {
    get: () => settings,
    patch: (next: Partial<AppSettings>) => {
      settings = { ...settings, ...next };
      return settings;
    }
  };
  const windows = {
    showMessageBox: vi.fn(async () => ({ response, checkboxChecked: false }))
  } as unknown as ReminderWindows;
  const onChange = vi.fn();
  return {
    preferences: new StartupPreferences(settingsStore, windows, onChange),
    get settings() {
      return settings;
    },
    windows: windows as unknown as { showMessageBox: ReturnType<typeof vi.fn> },
    onChange
  };
}
