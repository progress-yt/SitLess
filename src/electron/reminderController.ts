import { EventEmitter } from 'node:events';
import { getDateKey, getRecentDateKeys, getScheduleStatus, parseTimeToMinutes, secondsUntil } from '../shared/schedule';
import { evaluateReminderEngine } from '../shared/reminderEngine';
import { getWorkdayGateStatus } from '../shared/workday';
import type {
  AppSettings,
  AppSnapshot,
  AppStatus,
  CountdownAction,
  DailyDetailRecord,
  DailyPoem,
  DailyPoemRefreshResult,
  DailyRecordCorrection,
  DailyStats,
  DaySession,
  ReminderRuntimeState,
  StatsOverview
} from '../shared/types';

const MANUAL_POEM_REFRESH_COOLDOWN_SECONDS = 60;

interface ReminderSettingsStore {
  get: () => AppSettings;
}

interface ReminderStatsStore {
  getToday: (date?: Date) => DailyStats;
  getOverview: (date?: Date) => StatsOverview;
  getRecentDays: (limit?: number, date?: Date) => Record<string, DailyStats>;
  setDay: (dateKey: string, stats: DailyStats) => DailyStats;
  increment: (field: 'reminders' | 'completed' | 'skipped', date?: Date) => DailyStats;
}

interface ReminderDaySessionStore {
  getToday: (date?: Date) => DaySession;
  getRecentDays: (limit?: number, date?: Date) => Record<string, DaySession>;
  setDay: (dateKey: string, session: DaySession) => DaySession;
  start: (date?: Date) => DaySession;
  end: (date?: Date) => DaySession;
  markStartPrompted: (date?: Date) => DaySession;
}

interface ReminderRuntimeStateStore {
  get: (date?: Date) => ReminderRuntimeState;
  setPauseUntil: (date: Date | null) => ReminderRuntimeState;
  muteToday: (date?: Date) => ReminderRuntimeState;
  clearMute: () => ReminderRuntimeState;
}

interface ReminderPoemStore {
  getToday: (date?: Date) => DailyPoem;
  refreshToday: (date?: Date, options?: { force?: boolean }) => Promise<DailyPoem>;
}

interface ReminderControllerDeps {
  getIdleSeconds: () => number;
  showNotification: () => void;
  confirmWorkdayStart: () => Promise<boolean>;
  openCountdown: () => void;
  closeCountdown: () => void;
  openFullscreen: () => void;
  closeFullscreen: () => void;
}

type RuntimePhase = 'running' | 'snoozed' | 'countdown' | 'fullscreen';

interface ReminderTriggerOptions {
  countReminder: boolean;
  countOutcome: boolean;
}

export class ReminderController extends EventEmitter {
  private phase: RuntimePhase = 'running';
  private cycleStartedAt: number | null = null;
  private snoozeUntil: number | null = null;
  private lastWithinSchedule = false;
  private countdownTimer: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private workdayPromptInFlight = false;
  private currentReminderCountsOutcome = true;
  private snapshot: AppSnapshot;
  private imageRevision = 0;
  private lastPoemRefreshDateKey: string | null = null;
  private poemRefreshInFlight = false;
  private manualPoemRefreshInFlight = false;
  private lastManualPoemRefreshAtMs: number | null = null;
  private cachedDailyRecords: DailyDetailRecord[] | null = null;
  private cachedStatsOverview: StatsOverview | null = null;
  private cachedRecordsDateKey: string | null = null;
  private recordsCacheDirty = true;

  constructor(
    private readonly settingsStore: ReminderSettingsStore,
    private readonly statsStore: ReminderStatsStore,
    private readonly daySessionStore: ReminderDaySessionStore,
    private readonly runtimeStateStore: ReminderRuntimeStateStore,
    private readonly poemStore: ReminderPoemStore,
    private readonly deps: ReminderControllerDeps
  ) {
    super();
    this.snapshot = this.buildSnapshot(new Date(), 'outside-schedule', null, 0);
  }

  start(): void {
    this.tick();
    this.interval = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.clearCountdownTimer();
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot;
  }

  refresh(): void {
    this.tick();
  }

  handleSettingsChange(previous: AppSettings, next: AppSettings): AppSnapshot {
    if (previous.mode !== next.mode) {
      this.clearCountdownTimer();
      this.deps.closeCountdown();
      this.deps.closeFullscreen();
      this.phase = 'running';
      this.snoozeUntil = null;
      this.resetCycle(new Date());
    }

    this.tick();
    return this.snapshot;
  }

  bumpImageRevision(): void {
    this.imageRevision += 1;
    this.tick();
  }

  async refreshDailyPoem(): Promise<DailyPoemRefreshResult> {
    const now = new Date();
    if (this.poemRefreshInFlight || this.manualPoemRefreshInFlight) {
      const snapshot = this.buildSnapshot(now, this.snapshot.status, this.snapshot.remainingSeconds, this.deps.getIdleSeconds());
      this.emitSnapshot(snapshot);
      return {
        snapshot,
        status: 'busy',
        retryAfterSeconds: snapshot.dailyPoemRefresh.retryAfterSeconds
      };
    }

    const retryAfterSeconds = this.getManualPoemRefreshRetryAfterSeconds(now);
    if (retryAfterSeconds > 0) {
      const snapshot = this.buildSnapshot(now, this.snapshot.status, this.snapshot.remainingSeconds, this.deps.getIdleSeconds());
      this.emitSnapshot(snapshot);
      return {
        snapshot,
        status: 'rate-limited',
        retryAfterSeconds
      };
    }

    this.lastManualPoemRefreshAtMs = now.getTime();
    this.manualPoemRefreshInFlight = true;
    this.emitSnapshot(this.buildSnapshot(now, this.snapshot.status, this.snapshot.remainingSeconds, this.deps.getIdleSeconds()));

    let status: DailyPoemRefreshResult['status'] = 'fallback';
    try {
      const poem = await this.poemStore.refreshToday(now, { force: true });
      this.lastPoemRefreshDateKey = getDateKey(now);
      status = poem.source === 'jinrishici' ? 'refreshed' : 'fallback';
    } catch {
      status = 'fallback';
    } finally {
      this.manualPoemRefreshInFlight = false;
    }

    const snapshot = this.buildSnapshot(new Date(), this.snapshot.status, this.snapshot.remainingSeconds, this.deps.getIdleSeconds());
    this.emitSnapshot(snapshot);
    return {
      snapshot,
      status,
      retryAfterSeconds: snapshot.dailyPoemRefresh.retryAfterSeconds
    };
  }

  pauseForHour(): AppSnapshot {
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.runtimeStateStore.setPauseUntil(new Date(Date.now() + 60 * 60 * 1000));
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  resumeReminders(): AppSnapshot {
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.snoozeUntil = null;
    this.runtimeStateStore.setPauseUntil(null);
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  muteToday(): AppSnapshot {
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.runtimeStateStore.muteToday();
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  startWorkday(): AppSnapshot {
    this.daySessionStore.start();
    this.runtimeStateStore.clearMute();
    this.invalidateRecordsCache();
    this.phase = 'running';
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  endWorkday(): AppSnapshot {
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.daySessionStore.end();
    this.invalidateRecordsCache();
    this.phase = 'running';
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  testReminderFlow(): AppSnapshot {
    this.triggerReminder({
      countReminder: false,
      countOutcome: false
    });
    return this.snapshot;
  }

  updateDailyRecord(correction: DailyRecordCorrection): AppSnapshot {
    const normalized = normalizeDailyRecordCorrection(correction);
    const session: DaySession = {
      status: normalized.workStatus,
      startedAtIso: normalized.workStartedAtIso,
      endedAtIso: normalized.workEndedAtIso,
      startPromptedAtIso: null
    };
    this.daySessionStore.setDay(normalized.dateKey, session);
    this.statsStore.setDay(normalized.dateKey, {
      reminders: normalized.reminders,
      completed: normalized.completed,
      skipped: normalized.skipped
    });
    this.invalidateRecordsCache();
    this.tick();
    return this.snapshot;
  }

  handleCountdownAction(action: CountdownAction): void {
    if (this.phase !== 'countdown' && action !== 'timeout') {
      return;
    }

    this.clearCountdownTimer();
    this.deps.closeCountdown();

    if (action === 'start-rest' || action === 'timeout') {
      this.phase = 'fullscreen';
      this.deps.openFullscreen();
      this.emitSnapshot(this.buildSnapshot(new Date(), 'fullscreen', null, this.deps.getIdleSeconds()));
      return;
    }

    if (action === 'snooze') {
      const settings = this.settingsStore.get();
      this.phase = 'snoozed';
      this.snoozeUntil = Date.now() + settings.snoozeMinutes * 60 * 1000;
      this.tick();
      return;
    }

    if (action === 'skip') {
      if (this.currentReminderCountsOutcome) {
        this.statsStore.increment('skipped');
        this.invalidateRecordsCache();
      }
      this.phase = 'running';
      this.resetCycle(new Date());
      this.tick();
    }
  }

  completeRest(): void {
    if (this.phase !== 'fullscreen') {
      return;
    }

    this.deps.closeFullscreen();
    if (this.currentReminderCountsOutcome) {
      this.statsStore.increment('completed');
      this.invalidateRecordsCache();
    }
    this.phase = 'running';
    this.resetCycle(new Date());
    this.tick();
  }

  private tick(): void {
    const now = new Date();
    const settings = this.settingsStore.get();
    const idleSeconds = this.deps.getIdleSeconds();
    const runtimeState = this.runtimeStateStore.get(now);
    this.maybePromptWorkdayStart(now);
    this.refreshDailyPoemIfNeeded(now);

    if (this.maybeEndOvertimeWorkday(now, settings, idleSeconds)) {
      return;
    }

    if (this.phase === 'countdown') {
      this.emitSnapshot(this.buildSnapshot(now, 'countdown', null, idleSeconds));
      return;
    }

    if (this.phase === 'fullscreen') {
      this.emitSnapshot(this.buildSnapshot(now, 'fullscreen', null, idleSeconds));
      return;
    }

    const daySession = this.daySessionStore.getToday(now);
    const workdayGate = getWorkdayGateStatus(now, settings, daySession);
    if (!workdayGate.canRunReminders) {
      this.lastWithinSchedule = false;
      this.cycleStartedAt = null;
      this.emitSnapshot(this.buildSnapshot(now, workdayGate.status as AppStatus, null, idleSeconds));
      return;
    }

    if (!this.lastWithinSchedule) {
      this.resetCycle(now);
      this.lastWithinSchedule = true;
    }

    if (runtimeState.mutedDateKey === getDateKey(now)) {
      this.emitSnapshot(this.buildSnapshot(now, 'muted-today', null, idleSeconds));
      return;
    }

    if (runtimeState.pauseUntilIso) {
      this.emitSnapshot(this.buildSnapshot(now, 'paused', secondsUntil(now, new Date(runtimeState.pauseUntilIso).getTime()), idleSeconds));
      return;
    }

    if (this.snapshot.status === 'paused') {
      this.resetCycle(now);
    }

    if (this.phase === 'snoozed') {
      if (this.snoozeUntil && this.snoozeUntil > now.getTime()) {
        this.emitSnapshot(this.buildSnapshot(now, 'snoozed', secondsUntil(now, this.snoozeUntil), idleSeconds));
        return;
      }

      this.snoozeUntil = null;
      this.triggerReminder({
        countReminder: false,
        countOutcome: this.currentReminderCountsOutcome
      });
      return;
    }

    const engineResult = evaluateReminderEngine({
      nowMs: now.getTime(),
      cycleStartedAt: this.cycleStartedAt,
      idleSeconds,
      settings
    });

    this.cycleStartedAt = engineResult.cycleStartedAt;

    if (engineResult.action === 'trigger') {
      this.triggerReminder({
        countReminder: true,
        countOutcome: true
      });
      return;
    }

    this.emitSnapshot(this.buildSnapshot(now, engineResult.status, engineResult.remainingSeconds, idleSeconds));
  }

  private triggerReminder(options: ReminderTriggerOptions): void {
    if (this.phase === 'countdown' || this.phase === 'fullscreen') {
      return;
    }

    this.currentReminderCountsOutcome = options.countOutcome;
    if (options.countReminder) {
      this.statsStore.increment('reminders');
      this.invalidateRecordsCache();
    }

    this.phase = 'countdown';
    this.deps.showNotification();
    this.deps.openCountdown();
    this.clearCountdownTimer();
    this.countdownTimer = setTimeout(() => {
      this.handleCountdownAction('timeout');
    }, this.settingsStore.get().countdownSeconds * 1000);
    this.emitSnapshot(this.buildSnapshot(new Date(), 'countdown', null, this.deps.getIdleSeconds()));
  }

  private maybePromptWorkdayStart(now: Date): void {
    if (process.env.SITLESS_SKIP_WORKDAY_PROMPT === '1') {
      return;
    }

    if (this.workdayPromptInFlight) {
      return;
    }

    const daySession = this.daySessionStore.getToday(now);
    if (daySession.status !== 'not-started' || daySession.startPromptedAtIso) {
      return;
    }

    const settings = this.settingsStore.get();
    if (!shouldPromptWorkdayStart(now, settings)) {
      return;
    }

    this.workdayPromptInFlight = true;
    this.daySessionStore.markStartPrompted(now);
    void this.deps.confirmWorkdayStart()
      .then((confirmed) => {
        if (confirmed) {
          this.startWorkday();
        } else {
          this.tick();
        }
      })
      .finally(() => {
        this.workdayPromptInFlight = false;
      });
  }

  private refreshDailyPoemIfNeeded(now: Date): void {
    const dateKey = getDateKey(now);
    if (this.lastPoemRefreshDateKey === dateKey || this.poemRefreshInFlight) {
      return;
    }

    this.lastPoemRefreshDateKey = dateKey;
    this.poemRefreshInFlight = true;
    void this.poemStore.refreshToday(now)
      .finally(() => {
        this.poemRefreshInFlight = false;
        this.emitSnapshot(this.buildSnapshot(new Date(), this.snapshot.status, this.snapshot.remainingSeconds, this.deps.getIdleSeconds()));
      });
  }

  private resetCycle(now: Date): void {
    this.cycleStartedAt = now.getTime();
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private buildSnapshot(now: Date, status: AppStatus, remainingSeconds: number | null, idleSeconds: number): AppSnapshot {
    const settings = this.settingsStore.get();
    const schedule = getScheduleStatus(now, settings);
    const daySession = this.daySessionStore.getToday(now);
    const workdayGate = getWorkdayGateStatus(now, settings, daySession);
    const runtimeState = this.runtimeStateStore.get(now);
    const nextReminderAtIso =
      status === 'counting' && remainingSeconds !== null
        ? new Date(now.getTime() + remainingSeconds * 1000).toISOString()
        : null;

    const todayDateKey = getDateKey(now);
    if (
      this.recordsCacheDirty ||
      this.cachedRecordsDateKey !== todayDateKey ||
      this.cachedStatsOverview === null ||
      this.cachedDailyRecords === null
    ) {
      this.cachedStatsOverview = this.statsStore.getOverview(now);
      this.cachedDailyRecords = this.buildDailyRecords(now);
      this.cachedRecordsDateKey = todayDateKey;
      this.recordsCacheDirty = false;
    }

    return {
      nowIso: now.toISOString(),
      status,
      settings,
      todayStats: this.statsStore.getToday(now),
      statsOverview: this.cachedStatsOverview!,
      dailyRecords: this.cachedDailyRecords!,
      canRunReminders: workdayGate.canRunReminders,
      scheduleReason: schedule.reason,
      remainingSeconds,
      nextReminderAtIso,
      pauseUntilIso: runtimeState.pauseUntilIso,
      mutedToday: runtimeState.mutedDateKey === todayDateKey,
      daySession,
      dailyPoem: this.poemStore.getToday(now),
      dailyPoemRefresh: this.getDailyPoemRefreshState(now),
      idleSeconds,
      imageRevision: this.imageRevision
    };
  }

  private getDailyPoemRefreshState(now: Date) {
    const retryAfterSeconds = this.getManualPoemRefreshRetryAfterSeconds(now);
    const isRefreshing = this.poemRefreshInFlight || this.manualPoemRefreshInFlight;
    return {
      canRefresh: !isRefreshing && retryAfterSeconds === 0,
      isRefreshing,
      retryAfterSeconds
    };
  }

  private getManualPoemRefreshRetryAfterSeconds(now: Date): number {
    if (this.lastManualPoemRefreshAtMs === null) {
      return 0;
    }

    const elapsedMs = now.getTime() - this.lastManualPoemRefreshAtMs;
    const remainingMs = MANUAL_POEM_REFRESH_COOLDOWN_SECONDS * 1000 - elapsedMs;
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  private emitSnapshot(snapshot: AppSnapshot): void {
    this.snapshot = snapshot;
    this.emit('snapshot', snapshot);
  }

  private maybeEndOvertimeWorkday(now: Date, settings: AppSettings, idleSeconds: number): boolean {
    const daySession = this.daySessionStore.getToday(now);
    if (daySession.status !== 'working') {
      return false;
    }

    if (this.phase === 'countdown' || this.phase === 'fullscreen') {
      return false;
    }

    const schedule = getScheduleStatus(now, settings);
    if (schedule.reason !== 'after-work') {
      return false;
    }

    if (idleSeconds < settings.autoEndIdleMinutes * 60) {
      return false;
    }

    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.snoozeUntil = null;

    const endedAt = getOvertimeEndDate(now, settings, idleSeconds);
    this.daySessionStore.end(endedAt);
    this.invalidateRecordsCache();
    this.resetCycle(now);
    this.emitSnapshot(this.buildSnapshot(now, 'off-work', null, idleSeconds));
    return true;
  }

  private invalidateRecordsCache(): void {
    this.recordsCacheDirty = true;
  }

  private buildDailyRecords(now: Date): DailyDetailRecord[] {
    const limit = 30;
    const statsByDay = this.statsStore.getRecentDays(limit, now);
    const sessionsByDay = this.daySessionStore.getRecentDays(limit, now);

    return getRecentDateKeys(limit, now)
      .map((dateKey) => {
        const stats = statsByDay[dateKey] ?? { reminders: 0, completed: 0, skipped: 0 };
        const session = sessionsByDay[dateKey] ?? {
          status: 'not-started',
          startedAtIso: null,
          endedAtIso: null,
          startPromptedAtIso: null
        };

        return {
          dateKey,
          workStatus: session.status,
          workStartedAtIso: session.startedAtIso,
          workEndedAtIso: session.endedAtIso,
          reminders: stats.reminders,
          completed: stats.completed,
          skipped: stats.skipped,
          completionRate: stats.reminders > 0 ? stats.completed / stats.reminders : 0
        };
      })
      .filter((record, index) => index === 0 || hasDailyRecordActivity(record));
  }
}

export function shouldPromptWorkdayStart(date: Date, settings: AppSettings): boolean {
  return getScheduleStatus(date, settings).reason === 'weekday';
}

export function getOvertimeEndDate(date: Date, settings: AppSettings, idleSeconds: number): Date {
  const lastActiveAt = new Date(date.getTime() - Math.max(0, idleSeconds) * 1000);
  const scheduledEndAt = getScheduledWorkEndDate(date, settings);
  return lastActiveAt.getTime() > scheduledEndAt.getTime() ? lastActiveAt : scheduledEndAt;
}

function getScheduledWorkEndDate(date: Date, settings: AppSettings): Date {
  const startMinutes = parseTimeToMinutes(settings.workSchedule.start);
  const endMinutes = parseTimeToMinutes(settings.workSchedule.end);
  const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, endMinutes, 0, 0);

  if (endMinutes <= startMinutes && parseTimeToMinutes(formatTime(date)) < startMinutes) {
    return endDate;
  }

  if (endMinutes <= startMinutes) {
    endDate.setDate(endDate.getDate() + 1);
  }

  return endDate;
}

function normalizeDailyRecordCorrection(correction: DailyRecordCorrection): DailyRecordCorrection {
  const reminders = normalizeRecordCount(correction.reminders);
  const completed = Math.min(normalizeRecordCount(correction.completed), reminders);
  const skipped = Math.min(normalizeRecordCount(correction.skipped), reminders - completed);

  return {
    ...correction,
    reminders,
    completed,
    skipped
  };
}

function normalizeRecordCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function hasDailyRecordActivity(record: DailyDetailRecord): boolean {
  return (
    record.workStatus !== 'not-started' ||
    record.workStartedAtIso !== null ||
    record.workEndedAtIso !== null ||
    record.reminders > 0 ||
    record.completed > 0 ||
    record.skipped > 0
  );
}
