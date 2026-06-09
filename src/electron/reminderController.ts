import { EventEmitter } from 'node:events';
import { getScheduleStatus, secondsUntil } from '../shared/schedule';
import { evaluateReminderEngine } from '../shared/reminderEngine';
import { getWorkdayGateStatus } from '../shared/workday';
import type {
  AppSettings,
  AppSnapshot,
  AppStatus,
  CountdownAction,
  DailyDetailRecord,
  DailyPoem,
  DailyRecordCorrection,
  DailyStats,
  DaySession,
  ReminderRuntimeState,
  StatsOverview
} from '../shared/types';

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
  refreshToday: (date?: Date) => Promise<DailyPoem>;
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

export class ReminderController extends EventEmitter {
  private phase: RuntimePhase = 'running';
  private cycleStartedAt: number | null = null;
  private snoozeUntil: number | null = null;
  private lastWithinSchedule = false;
  private countdownTimer: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private workdayPromptInFlight = false;
  private currentReminderCountsStats = true;
  private snapshot: AppSnapshot;
  private imageRevision = 0;
  private lastPoemRefreshDateKey: string | null = null;
  private poemRefreshInFlight = false;

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

  bumpImageRevision(): void {
    this.imageRevision += 1;
    this.tick();
  }

  refreshDailyPoem(): void {
    this.tick();
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
    this.phase = 'running';
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  testReminderFlow(): AppSnapshot {
    this.triggerReminder(false);
    return this.snapshot;
  }

  updateDailyRecord(correction: DailyRecordCorrection): AppSnapshot {
    const session: DaySession = {
      status: correction.workStatus,
      startedAtIso: correction.workStartedAtIso,
      endedAtIso: correction.workEndedAtIso,
      startPromptedAtIso: null
    };
    this.daySessionStore.setDay(correction.dateKey, session);
    this.statsStore.setDay(correction.dateKey, {
      reminders: correction.reminders,
      completed: correction.completed,
      skipped: correction.skipped
    });
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
      if (this.currentReminderCountsStats) {
        this.statsStore.increment('skipped');
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
    if (this.currentReminderCountsStats) {
      this.statsStore.increment('completed');
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
      this.emitSnapshot(this.buildSnapshot(now, workdayGate.status === 'ready' ? 'outside-schedule' : workdayGate.status, null, idleSeconds));
      return;
    }

    if (!this.lastWithinSchedule) {
      this.resetCycle(now);
      this.lastWithinSchedule = true;
    }

    if (runtimeState.mutedDateKey === localDateKey(now)) {
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
      this.triggerReminder(true);
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
      this.triggerReminder(true);
      return;
    }

    this.emitSnapshot(this.buildSnapshot(now, engineResult.status, engineResult.remainingSeconds, idleSeconds));
  }

  private triggerReminder(countStats: boolean): void {
    if (this.phase === 'countdown' || this.phase === 'fullscreen') {
      return;
    }

    this.currentReminderCountsStats = countStats;
    if (countStats) {
      this.statsStore.increment('reminders');
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

    if (!shouldPromptWorkdayStart(now)) {
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
    const dateKey = localDateKey(now);
    if (this.lastPoemRefreshDateKey === dateKey || this.poemRefreshInFlight) {
      return;
    }

    this.lastPoemRefreshDateKey = dateKey;
    this.poemRefreshInFlight = true;
    void this.poemStore.refreshToday(now)
      .then(() => {
        this.emitSnapshot(this.buildSnapshot(new Date(), this.snapshot.status, this.snapshot.remainingSeconds, this.deps.getIdleSeconds()));
      })
      .finally(() => {
        this.poemRefreshInFlight = false;
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

    return {
      nowIso: now.toISOString(),
      status,
      settings,
      todayStats: this.statsStore.getToday(now),
      statsOverview: this.statsStore.getOverview(now),
      dailyRecords: this.buildDailyRecords(now),
      canRunReminders: workdayGate.canRunReminders,
      scheduleReason: schedule.reason,
      remainingSeconds,
      nextReminderAtIso,
      pauseUntilIso: runtimeState.pauseUntilIso,
      mutedToday: runtimeState.mutedDateKey === localDateKey(now),
      daySession,
      dailyPoem: this.poemStore.getToday(now),
      idleSeconds,
      imageRevision: this.imageRevision
    };
  }

  private emitSnapshot(snapshot: AppSnapshot): void {
    this.snapshot = snapshot;
    this.emit('snapshot', snapshot);
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

export function shouldPromptWorkdayStart(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= 8 * 60 + 30;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRecentDateKeys(limit: number, date: Date): string[] {
  const days = Math.max(1, Math.floor(limit));
  return Array.from({ length: days }, (_value, index) => {
    const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    current.setDate(current.getDate() - index);
    return localDateKey(current);
  });
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
