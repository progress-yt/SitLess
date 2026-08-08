import { app } from 'electron';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import {
  normalizeDaySessionFile,
  normalizeRuntimeState,
  normalizeSettings,
  normalizeStatsFile
} from '../shared/persistence';
import type { DataOperationResult, DailyStatsFile } from '../shared/types';
import { readJsonFile } from './jsonStore';
import type { ReminderWindows } from './reminderWindows';
import { writeDiagnosticLog } from './diagnosticLog';
import { commitImportFiles, type ImportFiles } from './importTransaction';
import { redactLocalPaths } from './diagnosticLogFile';

const MAX_BACKUP_BYTES = 30 * 1024 * 1024;

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
    if (statSync(source).size > MAX_BACKUP_BYTES) {
      throw new Error('备份文件超过 30 MB，无法导入');
    }
    const parsed = JSON.parse(readFileSync(source, 'utf8')) as Partial<BackupPayload>;
    if (parsed.format !== 'sitless-backup' || parsed.version !== 1) {
      throw new Error('不是受支持的 SitLess 备份文件');
    }
    commitImportFiles(this.userDataPath, createImportFiles(this.userDataPath, parsed));
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
    const log = readRecentDiagnosticLog(this.userDataPath);
    const settings = normalizeSettings(this.readDataFile('settings.json', {}));
    settings.customReminderImagePath = settings.customReminderImagePath ? '<managed-image>' : null;
    const diagnostics = {
      generatedAtIso: new Date().toISOString(),
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      settings,
      runtimeState: normalizeRuntimeState(this.readDataFile('runtime-state.json', {})),
      log: redactLocalPaths(log, [this.userDataPath, homedir()])
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

function readRecentDiagnosticLog(userDataPath: string): string {
  const content = ['sitless.1.log', 'sitless.log']
    .map((filename) => join(userDataPath, filename))
    .filter(existsSync)
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('');
  return content.slice(-100_000);
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
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
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
  const bytes = readFileSync(filePath);
  return validateReminderImage(extension, bytes)
    ? { extension, dataBase64: bytes.toString('base64') }
    : null;
}

function decodeCustomImage(image: BackupPayload['customImage']): { extension: string; bytes: Buffer } | null {
  if (!image || !['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(image.extension)) {
    return null;
  }
  const bytes = Buffer.from(image.dataBase64, 'base64');
  if (bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
    throw new Error('备份中的提醒图片无效或超过 20 MB');
  }
  if (!validateReminderImage(image.extension, bytes)) {
    throw new Error('备份中的提醒图片内容与格式不匹配');
  }
  return { extension: image.extension, bytes };
}

function createImportFiles(userDataPath: string, payload: Partial<BackupPayload>): ImportFiles {
  const settings = normalizeSettings(payload.settings);
  const image = decodeCustomImage(payload.customImage);
  settings.customReminderImagePath = image
    ? join(userDataPath, 'images', `reminder${image.extension}`)
    : null;

  const files: ImportFiles = {};
  addJsonImport(files, 'settings.json', settings);
  addJsonImport(files, 'stats.json', normalizeStatsFile(payload.stats));
  addJsonImport(files, 'day-sessions.json', normalizeDaySessionFile(payload.daySessions));
  addJsonImport(files, 'runtime-state.json', normalizeRuntimeState(payload.runtimeState));
  if (payload.dailyPoem && typeof payload.dailyPoem === 'object') {
    addJsonImport(files, 'daily-poem.json', payload.dailyPoem);
  }
  if (image) {
    files[`images/reminder${image.extension}`] = image.bytes;
  }
  return files;
}

function addJsonImport(files: ImportFiles, filename: string, value: unknown): void {
  const content = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  files[filename] = content;
  files[`${filename}.bak`] = content;
}

export function validateReminderImage(extension: string, bytes: Buffer): boolean {
  if (extension === '.png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === '.gif') {
    const signature = bytes.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  if (extension === '.webp') {
    return bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (extension === '.svg') {
    const source = bytes.toString('utf8').trim();
    return /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(source)
      && !/<(?:script|foreignObject|iframe|object|embed)\b/i.test(source)
      && !/\bon\w+\s*=/i.test(source)
      && !/(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:|data:)/i.test(source)
      && !/<!DOCTYPE|<!ENTITY/i.test(source);
  }
  return false;
}
