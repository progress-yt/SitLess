import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSnapshot } from '../shared/types';
import { ReminderTray, type ReminderTrayCommands } from './reminderTray';

const electronMock = vi.hoisted(() => {
  const trays: TrayMock[] = [];
  class TrayMock {
    readonly setToolTip = vi.fn();
    readonly setContextMenu = vi.fn();

    constructor() {
      trays.push(this);
    }
  }
  return {
    trays,
    TrayMock,
    buildFromTemplate: vi.fn((template: Electron.MenuItemConstructorOptions[]) => template),
    createFromPath: vi.fn(() => ({})),
    createFromDataURL: vi.fn(() => ({}))
  };
});

vi.mock('electron', () => ({
  app: { getAppPath: () => 'C:\\sitless-test' },
  Menu: { buildFromTemplate: electronMock.buildFromTemplate },
  nativeImage: {
    createFromPath: electronMock.createFromPath,
    createFromDataURL: electronMock.createFromDataURL
  },
  Tray: electronMock.TrayMock
}));

describe('ReminderTray', () => {
  beforeEach(() => {
    electronMock.trays.length = 0;
    vi.clearAllMocks();
  });

  it('maps working-state menu items to commands', () => {
    const commands = createCommands();
    const tray = new ReminderTray(commands);
    tray.create(createSnapshot());
    const menu = getMenu();

    expect(findItem(menu, '我已上班').enabled).toBe(false);
    expect(findItem(menu, '我已下班').enabled).toBe(true);
    findItem(menu, '打开主界面').click?.({} as never, undefined as never, {} as never);
    findItem(menu, '暂停 1 小时').click?.({} as never, undefined as never, {} as never);
    findItem(menu, '专注 30 分钟').click?.({} as never, undefined as never, {} as never);
    findItem(menu, '退出').click?.({} as never, undefined as never, {} as never);

    expect(commands.showMain).toHaveBeenCalledOnce();
    expect(commands.pauseForHour).toHaveBeenCalledOnce();
    expect(commands.focusForMinutes).toHaveBeenCalledWith(30);
    expect(commands.quit).toHaveBeenCalledOnce();
  });

  it('turns the pause command into resume while paused', () => {
    const commands = createCommands();
    const tray = new ReminderTray(commands);
    tray.create(createSnapshot({
      status: 'paused',
      pauseUntilIso: '2026-08-09T12:00:00.000Z'
    }));
    const menu = getMenu();
    const resume = menu.find((item) => item.label?.startsWith('继续提醒（'))!;

    resume.click?.({} as never, undefined as never, {} as never);

    expect(commands.resumeReminders).toHaveBeenCalledOnce();
    expect(commands.pauseForHour).not.toHaveBeenCalled();
  });
});

function createSnapshot(patch: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    status: 'counting',
    remainingSeconds: 1200,
    pauseUntilIso: null,
    mutedToday: false,
    isOvertime: false,
    daySession: {
      status: 'working',
      startedAtIso: '2026-08-09T01:00:00.000Z',
      endedAtIso: null,
      startPromptedAtIso: null
    },
    ...patch
  } as AppSnapshot;
}

function createCommands(): ReminderTrayCommands {
  return {
    showMain: vi.fn(),
    startWorkday: vi.fn(),
    endWorkday: vi.fn(),
    pauseForHour: vi.fn(),
    focusForMinutes: vi.fn(),
    resumeReminders: vi.fn(),
    muteToday: vi.fn(),
    quit: vi.fn()
  };
}

function getMenu(): Electron.MenuItemConstructorOptions[] {
  return electronMock.trays[0].setContextMenu.mock.calls.at(-1)?.[0] as Electron.MenuItemConstructorOptions[];
}

function findItem(menu: Electron.MenuItemConstructorOptions[], label: string): Electron.MenuItemConstructorOptions {
  return menu.find((item) => item.label === label)!;
}
