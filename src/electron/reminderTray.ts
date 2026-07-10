import { app, Menu, nativeImage, Tray } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSnapshot } from '../shared/types';
import { FALLBACK_TRAY_ICON_DATA_URL } from './trayIconData';

export interface ReminderTrayCommands {
  showMain: () => void;
  startWorkday: () => void;
  endWorkday: () => void;
  pauseForHour: () => void;
  focusForMinutes: (minutes: number) => void;
  resumeReminders: () => void;
  muteToday: () => void;
  quit: () => void;
}

export class ReminderTray {
  private tray: Tray | null = null;

  constructor(private readonly commands: ReminderTrayCommands) {}

  create(snapshot: AppSnapshot): void {
    this.tray = new Tray(this.getIcon());
    this.tray.setToolTip('SitLess');
    this.update(snapshot);
  }

  update(snapshot: AppSnapshot): void {
    if (!this.tray) {
      return;
    }

    const pauseLabel = snapshot.status === 'paused' && snapshot.pauseUntilIso
      ? `继续提醒（原暂停到 ${formatTime(new Date(snapshot.pauseUntilIso))}）`
      : '暂停 1 小时';
    const todayLabel = snapshot.mutedToday ? '今日已停止提醒' : '今日不再提醒';

    this.tray.setToolTip(`SitLess - ${getTrayStatusLabel(snapshot)}`);
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开主界面', click: this.commands.showMain },
      { type: 'separator' },
      {
        label: snapshot.daySession.status === 'off-work' ? '继续提醒' : '我已上班',
        enabled: snapshot.daySession.status !== 'working',
        click: this.commands.startWorkday
      },
      {
        label: '我已下班',
        enabled: snapshot.daySession.status === 'working',
        click: this.commands.endWorkday
      },
      { type: 'separator' },
      {
        label: pauseLabel,
        click: snapshot.status === 'paused' ? this.commands.resumeReminders : this.commands.pauseForHour
      },
      { label: '专注 30 分钟', click: () => this.commands.focusForMinutes(30) },
      { label: todayLabel, enabled: !snapshot.mutedToday, click: this.commands.muteToday },
      { type: 'separator' },
      { label: '退出', click: this.commands.quit }
    ]));
  }

  private getIcon(): Electron.NativeImage {
    const iconPath = join(app.getAppPath(), 'assets', 'tray.png');
    return existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createFromDataURL(FALLBACK_TRAY_ICON_DATA_URL);
  }
}

export function getTrayStatusLabel(snapshot: AppSnapshot): string {
  if (snapshot.isOvertime && snapshot.status === 'counting') {
    return snapshot.remainingSeconds === null ? '加班提醒中' : `加班中，下次提醒 ${formatDuration(snapshot.remainingSeconds)}`;
  }

  switch (snapshot.status) {
    case 'counting':
      return snapshot.remainingSeconds === null ? '计时中' : `下次提醒 ${formatDuration(snapshot.remainingSeconds)}`;
    case 'idle-reset':
      return '等待键鼠活动';
    case 'lunch-break':
      return '午休不提醒';
    case 'awaiting-work-start':
      return '等待上班确认';
    case 'paused':
      return '已暂停';
    case 'snoozed':
      return '稍后提醒';
    case 'muted-today':
      return '今日不再提醒';
    case 'off-work':
      return '已下班';
    case 'countdown':
      return '等待处理';
    case 'fullscreen':
      return '休息中';
    default:
      return '不在提醒时段';
  }
}

function formatDuration(seconds: number): string {
  return `${Math.ceil(seconds / 60)} 分钟`;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
