import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  normalizeDaySessionFile,
  normalizeRuntimeState,
  normalizeSettings,
  normalizeStatsFile
} from '../shared/persistence';
import type { DataOperationResult, DailyStatsFile } from '../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import type { ReminderWindows } from './reminderWindows';
import { writeDiagnosticLog } from './diagnosticLog';

interface BackupPayload {
  format: 'sitless-backup';
  version: 1;
  exportedAtIso: string;
  settings: unknown;
  stats: unknown;
  daySessions: unknown;
  runtimeState: unknown;
  dailyPoem?: unknown;
  customImage?: { extension: string; dataBase64: string } | null;
}

export class LocalDataManager {
  private readonly userDataPath = app.getPath('userData');

  constructor(private readonly windows: ReminderWindows) {}

  async exportJson(): Promise<DataOperationResult> {
    const destination = await this.chooseSavePath('SitLess 数据备份', `sitless-backup-${dateStamp()}.json`, [
      { name: 'JSON', extensions: ['json'] }
    ]);
    if (!destination) {
      return cancelledResult();
    }
    const settings = normalizeSettings(this.readDataFile('settings.json', {}));
    const payload: BackupPayload = {
      format: 'sitless-backup',
      version: 1,
      exportedAtIso: new Date().toISOString(),
      settings,
      stats: this.readDataFile('stats.json', {}),
      daySessions: this.readDataFile('day-sessions.json', {}),
      runtimeState: this.readDataFile('runtime-state.json', {}),
      dailyPoem: this.readDataFile('daily-poem.json', {}),
      customImage: readCustomImage(settings.customReminderImagePath)
    };
    writeFileSync(destination, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    writeDiagnosticLog('data-export-json');
    return { cancelled: false, path: destination };
  }

  async importJson(): Promise<DataOperationResult> {
    const selection = await this.windows.showOpenDialog({
      title: '导入 SitLess 数据备份',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    const source = selection.filePaths[0];
    if (selection.canceled || !source) {
      return cancelledResult();
    }
    const parsed = JSON.parse(readFileSync(source, 'utf8')) as Partial<BackupPayload>;
    if (parsed.format !== 'sitless-backup' || parsed.version !== 1) {
      throw new Error('不是受支持的 SitLess 备份文件');
    }
    const settings = normalizeSettings(parsed.settings);
    settings.customReminderImagePath = restoreCustomImage(this.userDataPath, parsed.customImage) ?? null;
    writeJsonFile(join(this.userDataPath, 'settings.json'), settings);
    writeJsonFile(join(this.userDataPath, 'stats.json'), normalizeStatsFile(parsed.stats));
    writeJsonFile(join(this.userDataPath, 'day-sessions.json'), normalizeDaySessionFile(parsed.daySessions));
    writeJsonFile(join(this.userDataPath, 'runtime-state.json'), normalizeRuntimeState(parsed.runtimeState));
    if (parsed.dailyPoem && typeof parsed.dailyPoem === 'object') {
      writeJsonFile(join(this.userDataPath, 'daily-poem.json'), parsed.dailyPoem);
    }
    writeDiagnosticLog('data-import-json');
    return { cancelled: false, path: source, restartRequired: true };
  }

  async exportCsv(): Promise<DataOperationResult> {
    const destination = await this.chooseSavePath('导出 SitLess 统计', `sitless-stats-${dateStamp()}.csv`, [
      { name: 'CSV', extensions: ['csv'] }
    ]);
    if (!destination) {
      return cancelledResult();
    }
    const stats = normalizeStatsFile(this.readDataFile('stats.json', {}));
    writeFileSync(destination, toStatsCsv(stats), 'utf8');
    writeDiagnosticLog('data-export-csv');
    return { cancelled: false, path: destination };
  }

  async exportDiagnostics(): Promise<DataOperationResult> {
    const destination = await this.chooseSavePath('导出 SitLess 诊断信息', `sitless-diagnostics-${dateStamp()}.json`, [
      { name: 'JSON', extensions: ['json'] }
    ]);
    if (!destination) {
      return cancelledResult();
    }
    const logPath = join(this.userDataPath, 'sitless.log');
    const diagnostics = {
      generatedAtIso: new Date().toISOString(),
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      settings: normalizeSettings(this.readDataFile('settings.json', {})),
      runtimeState: normalizeRuntimeState(this.readDataFile('runtime-state.json', {})),
      log: existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-100_000) : ''
    };
    writeFileSync(destination, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');
    writeDiagnosticLog('diagnostics-export');
    return { cancelled: false, path: destination };
  }

  private readDataFile(filename: string, fallback: unknown): unknown {
    return readJsonFile(join(this.userDataPath, filename), fallback);
  }

  private async chooseSavePath(
    title: string,
    defaultPath: string,
    filters: Electron.FileFilter[]
  ): Promise<string | null> {
    const result = await this.windows.showSaveDialog({ title, defaultPath, filters });
    return result.canceled || !result.filePath ? null : result.filePath;
  }
}

export function toStatsCsv(stats: DailyStatsFile): string {
  const header = ['日期', '提醒', '完成', '跳过', '稍后', '中断', '休息秒数', '最长专注秒数', '当前连续完成'];
  const rows = Object.entries(stats)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, day]) => [
      dateKey,
      day.reminders,
      day.completed,
      day.skipped,
      day.snoozed,
      day.interrupted,
      day.restSeconds,
      day.longestFocusSeconds,
      day.currentCompletionStreak
    ].join(','));
  return `\uFEFF${[header.join(','), ...rows].join('\r\n')}\r\n`;
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function cancelledResult(): DataOperationResult {
  return { cancelled: true, path: null };
}

function readCustomImage(filePath: string | null): BackupPayload['customImage'] {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }
  const extension = extname(filePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(extension)) {
    return null;
  }
  return { extension, dataBase64: readFileSync(filePath).toString('base64') };
}

function restoreCustomImage(userDataPath: string, image: BackupPayload['customImage']): string | null {
  if (!image || !['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(image.extension)) {
    return null;
  }
  const bytes = Buffer.from(image.dataBase64, 'base64');
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
    throw new Error('备份中的提醒图片无效或超过 20 MB');
  }
  const directory = join(userDataPath, 'images');
  mkdirSync(directory, { recursive: true });
  const destination = join(directory, `reminder${image.extension}`);
  writeFileSync(destination, bytes);
  return destination;
}
