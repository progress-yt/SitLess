import { EventEmitter } from 'node:events';
import { clampNumber, getDateKey, getEffectiveSchedule, getRecentDateKeys, getScheduleStatus, parseTimeToMinutes, secondsUntil } from '../shared/schedule';
import { evaluateReminderEngine } from '../shared/reminderEngine';
import { createTrendPoints } from '../shared/stats';
import { REST_EXERCISES } from '../shared/defaults';
import { getWorkdayGateStatus } from '../shared/workday';
import { systemReminderClock, type ReminderClock, type ReminderTimerHandle } from './reminderClock';
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
  FocusContextState,
  FullscreenRestState,
  HistorySnapshot,
  ReminderRuntimeState,
  StatsOverview,
  TrendPoint
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
  incrementReminder: (date?: Date) => DailyStats;
  recordOutcome: (outcome: 'completed' | 'skipped' | 'snoozed' | 'interrupted', date?: Date) => DailyStats;
  addRestSeconds: (seconds: number, date?: Date) => DailyStats;
  recordFocusSeconds: (seconds: number, date?: Date) => DailyStats;
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
  setPauseUntil: (date: Date | null, currentDate?: Date) => ReminderRuntimeState;
  muteToday: (date?: Date) => ReminderRuntimeState;
  clearMute: (date?: Date) => ReminderRuntimeState;
  setSession: (patch: Partial<ReminderRuntimeState>, date?: Date) => ReminderRuntimeState;
}

interface ReminderPoemStore {
  getToday: (date?: Date) => DailyPoem;
  refreshToday: (date?: Date, options?: { force?: boolean }) => Promise<DailyPoem>;
}

interface ReminderControllerDeps {
  getIdleSeconds: () => number;
  showNotification: () => void;
  confirmWorkdayStart: () => Promise<WorkdayStartChoice>;
  openCountdown: () => void;
  closeCountdown: () => void;
  openFullscreen: () => void;
  closeFullscreen: () => void;
  isImageFallbackActive: () => boolean;
  getFocusContext?: () => FocusContextState;
}

type RuntimePhase = 'running' | 'snoozed' | 'countdown' | 'fullscreen';
type WorkdayStartChoice = 'start' | 'later' | 'mute-today';

interface ReminderTriggerOptions {
  countReminder: boolean;
  countOutcome: boolean;
}

export class ReminderController extends EventEmitter {
  private phase: RuntimePhase = 'running';
  private cycleStartedAt: number | null = null;
  private snoozeUntil: number | null = null;
  private fullscreenRestStartedAt: number | null = null;
  private workdayPromptSnoozeUntil: number | null = null;
  private consecutiveSnoozes = 0;
  private lastWithinSchedule = false;
  private countdownTimer: ReminderTimerHandle | null = null;
  private countdownEndsAt: number | null = null;
  private countdownDurationSeconds: number | null = null;
  private interval: ReminderTimerHandle | null = null;
  private workdayPromptInFlight = false;
  private currentReminderCountsOutcome = true;
  private currentReminderStartedAt: number | null = null;
  private activeWorkdayDateKey: string | null = null;
  private activeWorkdayIsLive = false;
  private snapshot: AppSnapshot;
  private imageRevision = 0;
  private lastPoemRefreshDateKey: string | null = null;
  private poemRefreshInFlight = false;
  private manualPoemRefreshInFlight = false;
  private lastManualPoemRefreshAtMs: number | null = null;
  private cachedDailyRecords: DailyDetailRecord[] | null = null;
  private cachedStatsOverview: StatsOverview | null = null;
  private cachedTrend: TrendPoint[] | null = null;
  private cachedRecordsDateKey: string | null = null;
  private recordsCacheDirty = true;

  constructor(
    private readonly settingsStore: ReminderSettingsStore,
    private readonly statsStore: ReminderStatsStore,
    private readonly daySessionStore: ReminderDaySessionStore,
    private readonly runtimeStateStore: ReminderRuntimeStateStore,
    private readonly poemStore: ReminderPoemStore,
    private readonly deps: ReminderControllerDeps,
    private readonly clock: ReminderClock = systemReminderClock
  ) {
    super();
    const now = this.clock.now();
    const todayDateKey = getDateKey(now);
    const recentSessions = this.daySessionStore.getRecentDays(30, now);
    this.activeWorkdayDateKey = getRecentDateKeys(30, now)
      .find((dateKey) => recentSessions[dateKey]?.status === 'working') ?? null;
    this.activeWorkdayIsLive = this.activeWorkdayDateKey === todayDateKey;
    const runtimeState = this.runtimeStateStore.get(now);
    this.cycleStartedAt = parsePastTimestamp(runtimeState.cycleStartedAtIso, now);
    this.currentReminderStartedAt = parsePastTimestamp(runtimeState.reminderStartedAtIso, now);
    this.consecutiveSnoozes = runtimeState.consecutiveSnoozes;
    const recoveredSnoozeUntil = parseTimestamp(runtimeState.snoozeUntilIso);
    if (runtimeState.reminderPhase === 'snoozed' && recoveredSnoozeUntil !== null) {
      this.phase = 'snoozed';
      this.snoozeUntil = recoveredSnoozeUntil;
    } else if (runtimeState.reminderPhase === 'pending') {
      // Reopen an interrupted reminder through the normal countdown flow, never directly as forced fullscreen.
      this.phase = 'snoozed';
      this.snoozeUntil = now.getTime();
    }
    this.snapshot = this.buildSnapshot(now, 'outside-schedule', null, 0);
  }

  start(): void {
    this.tick();
    this.interval = this.clock.setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    const now = this.clock.now();
    this.recordCurrentFocus(now);
    this.persistRuntimeSession(now);
    if (this.interval) {
      this.clock.clearInterval(this.interval);
      this.interval = null;
    }

    this.clearCountdownTimer();
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot;
  }

  getHistory(): HistorySnapshot {
    return {
      dailyRecords: this.snapshot.dailyRecords,
      trend: this.snapshot.trend
    };
  }

  refresh(): void {
    this.tick();
  }

  handleSettingsChange(previous: AppSettings, next: AppSettings): AppSnapshot {
    const now = this.clock.now();
    if (previous.mode !== next.mode) {
      this.recordCurrentFocus(now);
      this.clearCountdownTimer();
      this.deps.closeCountdown();
      this.deps.closeFullscreen();
      this.phase = 'running';
      this.snoozeUntil = null;
      this.fullscreenRestStartedAt = null;
      this.currentReminderStartedAt = null;
      this.resetCycle(now);
    }

    this.tick();
    return this.snapshot;
  }

  bumpImageRevision(): void {
    this.imageRevision += 1;
    this.tick();
  }

  async refreshDailyPoem(): Promise<DailyPoemRefreshResult> {
    const now = this.clock.now();
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

    const snapshot = this.buildSnapshot(this.clock.now(), this.snapshot.status, this.snapshot.remainingSeconds, this.deps.getIdleSeconds());
    this.emitSnapshot(snapshot);
    return {
      snapshot,
      status,
      retryAfterSeconds: snapshot.dailyPoemRefresh.retryAfterSeconds
    };
  }

  pauseForHour(): AppSnapshot {
    return this.focusForMinutes(60);
  }

  focusForMinutes(minutes: number): AppSnapshot {
    const now = this.clock.now();
    this.recordCurrentFocus(now);
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.snoozeUntil = null;
    this.fullscreenRestStartedAt = null;
    this.currentReminderStartedAt = null;
    const durationMinutes = clampNumber(Math.floor(Number(minutes)), 1, 240);
    this.runtimeStateStore.setPauseUntil(new Date(now.getTime() + durationMinutes * 60 * 1000), now);
    this.resetCycle(now);
    this.tick();
    return this.snapshot;
  }

  resumeReminders(): AppSnapshot {
    const now = this.clock.now();
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.snoozeUntil = null;
    this.fullscreenRestStartedAt = null;
    this.currentReminderStartedAt = null;
    this.consecutiveSnoozes = 0;
    this.runtimeStateStore.setPauseUntil(null, now);
    this.resetCycle(now);
    this.tick();
    return this.snapshot;
  }

  muteToday(): AppSnapshot {
    const now = this.clock.now();
    this.recordCurrentFocus(now);
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.fullscreenRestStartedAt = null;
    this.currentReminderStartedAt = null;
    this.consecutiveSnoozes = 0;
    this.snoozeUntil = null;
    this.runtimeStateStore.muteToday(now);
    this.resetCycle(now);
    this.tick();
    return this.snapshot;
  }

  startWorkday(): AppSnapshot {
    const now = this.clock.now();
    this.daySessionStore.start(now);
    this.activeWorkdayDateKey = getDateKey(now);
    this.activeWorkdayIsLive = true;
    this.runtimeStateStore.clearMute(now);
    this.invalidateRecordsCache();
    this.snoozeUntil = null;
    this.phase = 'running';
    this.fullscreenRestStartedAt = null;
    this.currentReminderStartedAt = null;
    this.workdayPromptSnoozeUntil = null;
    this.consecutiveSnoozes = 0;
    this.resetCycle(now);
    this.tick();
    return this.snapshot;
  }

  endWorkday(): AppSnapshot {
    const now = this.clock.now();
    this.recordCurrentFocus(now);
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.daySessionStore.end(now);
    this.activeWorkdayDateKey = null;
    this.activeWorkdayIsLive = false;
    this.invalidateRecordsCache();
    this.phase = 'running';
    this.snoozeUntil = null;
    this.fullscreenRestStartedAt = null;
    this.currentReminderStartedAt = null;
    this.consecutiveSnoozes = 0;
    this.resetCycle(now);
    this.tick();
    return this.snapshot;
  }

  testReminderFlow(): AppSnapshot {
    if (this.phase !== 'running') {
      return this.snapshot;
    }

    this.triggerReminder({
      countReminder: false,
      countOutcome: false
    });
    return this.snapshot;
  }

  updateDailyRecord(correction: DailyRecordCorrection): AppSnapshot {
    const now = this.clock.now();
    const normalized = normalizeDailyRecordCorrection(correction);
    const recordDate = new Date(`${normalized.dateKey}T12:00:00`);
    const session: DaySession = {
      status: normalized.workStatus,
      startedAtIso: normalized.workStartedAtIso,
      endedAtIso: normalized.workEndedAtIso,
      startPromptedAtIso: null
    };
    this.daySessionStore.setDay(normalized.dateKey, session);
    if (normalized.dateKey === getDateKey(now)) {
      this.activeWorkdayDateKey = normalized.workStatus === 'working' ? normalized.dateKey : null;
      this.activeWorkdayIsLive = normalized.workStatus === 'working';
    }
    this.statsStore.setDay(normalized.dateKey, {
      reminders: normalized.reminders,
      completed: normalized.completed,
      skipped: normalized.skipped,
      snoozed: normalized.snoozed,
      interrupted: normalized.interrupted,
      restSeconds: normalized.restSeconds,
      longestFocusSeconds: normalized.longestFocusSeconds,
      currentCompletionStreak: this.statsStore.getToday(recordDate).currentCompletionStreak
    });
    this.invalidateRecordsCache();
    this.tick();
    return this.snapshot;
  }

  handleCountdownAction(action: CountdownAction): void {
    if (this.phase !== 'countdown') {
      return;
    }

    this.clearCountdownTimer();
    this.deps.closeCountdown();

    if (action === 'timeout' && this.settingsStore.get().reminderStrength === 'gentle') {
      this.snoozeReminder();
      return;
    }

    if (action === 'start-rest' || action === 'timeout') {
      this.openFullscreenReminder(action === 'start-rest');
      return;
    }

    if (action === 'snooze') {
      this.snoozeReminder();
      return;
    }

    if (action === 'skip') {
      const now = this.clock.now();
      if (this.currentReminderCountsOutcome) {
        this.statsStore.recordOutcome('skipped', this.getCurrentReminderDate(now));
        this.invalidateRecordsCache();
        this.consecutiveSnoozes = 0;
      }
      this.phase = 'running';
      this.currentReminderStartedAt = null;
      this.resetCycle(now);
      this.tick();
    }
  }

  completeRest(): void {
    if (this.phase !== 'fullscreen') {
      return;
    }

    const now = this.clock.now();
    if (!this.canCompleteFullscreenRest(now)) {
      this.emitSnapshot(this.buildSnapshot(now, 'fullscreen', null, this.deps.getIdleSeconds()));
      return;
    }

    this.deps.closeFullscreen();
    if (this.currentReminderCountsOutcome) {
      const reminderDate = this.getCurrentReminderDate(now);
      this.statsStore.recordOutcome('completed', reminderDate);
      this.statsStore.addRestSeconds(this.getRestDurationSeconds(now), reminderDate);
      this.invalidateRecordsCache();
      this.consecutiveSnoozes = 0;
    }
    this.phase = 'running';
    this.fullscreenRestStartedAt = null;
    this.currentReminderStartedAt = null;
    this.resetCycle(now);
    this.tick();
  }

  startRest(): void {
    if (this.phase !== 'fullscreen') {
      return;
    }

    if (this.fullscreenRestStartedAt === null) {
      this.fullscreenRestStartedAt = this.clock.now().getTime();
    }
    this.tick();
  }

  interruptRest(): void {
    if (this.phase !== 'fullscreen') {
      return;
    }

    const now = this.clock.now();
    const settings = this.settingsStore.get();
    this.deps.closeFullscreen();
    if (this.currentReminderCountsOutcome) {
      this.statsStore.recordOutcome('interrupted', this.getCurrentReminderDate(now));
      this.invalidateRecordsCache();
      this.consecutiveSnoozes += 1;
    }
    this.fullscreenRestStartedAt = null;
    this.phase = 'snoozed';
    this.snoozeUntil = now.getTime() + settings.snoozeMinutes * 60 * 1000;
    this.persistRuntimeSession(now);
    this.tick();
  }

  handleReminderWindowClosed(view: 'countdown' | 'fullscreen'): void {
    if (view === 'countdown' && this.phase === 'countdown') {
      this.clearCountdownTimer();
      this.snoozeReminder();
      return;
    }

    if (view === 'fullscreen' && this.phase === 'fullscreen') {
      if (this.fullscreenRestStartedAt !== null) {
        this.interruptRest();
      } else {
        this.snoozeReminder();
      }
    }
  }

  private tick(): void {
    const now = this.clock.now();
    const settings = this.settingsStore.get();
    const idleSeconds = this.deps.getIdleSeconds();
    const runtimeState = this.runtimeStateStore.get(now);
    this.maybePromptWorkdayStart(now);
    this.refreshDailyPoemIfNeeded(now);
    this.maybeClosePreviousWorkday(now, settings, idleSeconds);

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
    if (runtimeState.mutedDateKey === getDateKey(now) && workdayGate.status !== 'outside-schedule') {
      this.emitSnapshot(this.buildSnapshot(now, 'muted-today', null, idleSeconds));
      return;
    }

    if (!workdayGate.canRunReminders) {
      this.recordCurrentFocus(now);
      this.lastWithinSchedule = false;
      if (this.cycleStartedAt !== null) {
        this.cycleStartedAt = null;
        this.persistRuntimeSession(now);
      }
      this.emitSnapshot(this.buildSnapshot(now, workdayGate.status as AppStatus, null, idleSeconds));
      return;
    }

    const focusContext = this.getFocusContext();
    if (settings.respectFocusContext && focusContext.active) {
      this.recordCurrentFocus(now);
      this.cycleStartedAt = null;
      this.persistRuntimeSession(now);
      this.emitSnapshot(this.buildSnapshot(now, 'context-paused', null, idleSeconds));
      return;
    }

    if (this.snapshot.status === 'context-paused') {
      this.resetCycle(now);
    }

    if (!this.lastWithinSchedule) {
      if (this.cycleStartedAt === null) {
        this.resetCycle(now);
      }
      this.lastWithinSchedule = true;
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

    if (engineResult.action === 'emit' && engineResult.status === 'idle-reset' && this.cycleStartedAt !== null) {
      this.recordCurrentFocus(now, idleSeconds);
    }

    if (this.cycleStartedAt !== engineResult.cycleStartedAt) {
      this.cycleStartedAt = engineResult.cycleStartedAt;
      this.persistRuntimeSession(now);
    }

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

    const now = this.clock.now();
    this.currentReminderCountsOutcome = options.countOutcome;
    this.fullscreenRestStartedAt = null;
    if (options.countReminder) {
      this.currentReminderStartedAt = now.getTime();
      this.recordCurrentFocus(now);
      this.statsStore.incrementReminder(now);
      this.invalidateRecordsCache();
    }

    this.deps.showNotification();
    if (this.settingsStore.get().reminderStrength === 'strong') {
      this.openFullscreenReminder(false);
      return;
    }

    this.phase = 'countdown';
    this.deps.openCountdown();
    this.clearCountdownTimer();
    this.countdownDurationSeconds = this.settingsStore.get().countdownSeconds;
    this.countdownEndsAt = now.getTime() + this.countdownDurationSeconds * 1000;
    this.countdownTimer = this.clock.setTimeout(() => {
      this.handleCountdownAction('timeout');
    }, this.countdownEndsAt - now.getTime());
    this.persistRuntimeSession(now);
    this.emitSnapshot(this.buildSnapshot(now, 'countdown', null, this.deps.getIdleSeconds()));
  }

  private snoozeReminder(): void {
    const now = this.clock.now();
    const settings = this.settingsStore.get();
    if (this.currentReminderCountsOutcome) {
      this.statsStore.recordOutcome('snoozed', this.getCurrentReminderDate(now));
      this.invalidateRecordsCache();
      this.consecutiveSnoozes += 1;
    }
    this.phase = 'snoozed';
    this.snoozeUntil = now.getTime() + settings.snoozeMinutes * 60 * 1000;
    this.persistRuntimeSession(now);
    this.tick();
  }

  private openFullscreenReminder(startRest: boolean): void {
    const now = this.clock.now();
    this.phase = 'fullscreen';
    this.fullscreenRestStartedAt = startRest ? now.getTime() : null;
    this.deps.openFullscreen();
    this.persistRuntimeSession(now);
    this.emitSnapshot(this.buildSnapshot(now, 'fullscreen', null, this.deps.getIdleSeconds()));
  }

  private maybePromptWorkdayStart(now: Date): void {
    if (process.env.SITLESS_SKIP_WORKDAY_PROMPT === '1') {
      return;
    }

    if (this.workdayPromptInFlight) {
      return;
    }

    if (this.workdayPromptSnoozeUntil && this.workdayPromptSnoozeUntil > now.getTime()) {
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

    const promptedDateKey = getDateKey(now);
    this.workdayPromptInFlight = true;
    void this.deps.confirmWorkdayStart()
      .then((choice) => {
        const resolvedAt = this.clock.now();
        const currentSession = this.daySessionStore.getToday(resolvedAt);
        if (
          getDateKey(resolvedAt) !== promptedDateKey ||
          !shouldPromptWorkdayStart(resolvedAt, this.settingsStore.get()) ||
          currentSession.status !== 'not-started'
        ) {
          this.tick();
          return;
        }

        if (choice === 'start') {
          this.startWorkday();
          return;
        }

        if (choice === 'mute-today') {
          this.daySessionStore.markStartPrompted(resolvedAt);
          this.runtimeStateStore.muteToday(resolvedAt);
          this.tick();
          return;
        }

        this.workdayPromptSnoozeUntil = resolvedAt.getTime() + this.settingsStore.get().workdayPromptSnoozeMinutes * 60 * 1000;
        this.tick();
      })
      .catch(() => {
        this.workdayPromptSnoozeUntil = this.clock.now().getTime() + this.settingsStore.get().workdayPromptSnoozeMinutes * 60 * 1000;
      })
      .finally(() => {
        this.workdayPromptInFlight = false;
        if (this.workdayPromptSnoozeUntil) {
          this.tick();
        }
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
        this.emitSnapshot(this.buildSnapshot(this.clock.now(), this.snapshot.status, this.snapshot.remainingSeconds, this.deps.getIdleSeconds()));
      });
  }

  private resetCycle(now: Date): void {
    this.cycleStartedAt = now.getTime();
    this.persistRuntimeSession(now);
  }

  private recordCurrentFocus(now: Date, idleSeconds = 0): void {
    if (this.phase !== 'running' || this.snapshot.status !== 'counting' || this.cycleStartedAt === null) {
      return;
    }

    const focusEndedAt = Math.max(this.cycleStartedAt, now.getTime() - Math.max(0, idleSeconds) * 1000);
    const focusSeconds = Math.floor((focusEndedAt - this.cycleStartedAt) / 1000);
    this.cycleStartedAt = null;

    if (focusSeconds > 0) {
      this.statsStore.recordFocusSeconds(focusSeconds, new Date(focusEndedAt));
      this.invalidateRecordsCache();
    }
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer) {
      this.clock.clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.countdownEndsAt = null;
    this.countdownDurationSeconds = null;
  }

  private buildSnapshot(now: Date, status: AppStatus, remainingSeconds: number | null, idleSeconds: number): AppSnapshot {
    const settings = this.settingsStore.get();
    const schedule = getScheduleStatus(now, settings);
    const daySession = this.daySessionStore.getToday(now);
    const workdayGate = getWorkdayGateStatus(now, settings, daySession);
    const runtimeState = this.runtimeStateStore.get(now);
    const isOvertime = daySession.status === 'working' && schedule.reason === 'after-work';
    const resolvedRemainingSeconds = status === 'countdown' && this.countdownEndsAt !== null
      ? secondsUntil(now, this.countdownEndsAt)
      : remainingSeconds;
    const nextReminderAtIso =
      status === 'counting' && resolvedRemainingSeconds !== null
        ? new Date(now.getTime() + resolvedRemainingSeconds * 1000).toISOString()
        : null;

    const todayDateKey = getDateKey(now);
    if (
      this.recordsCacheDirty ||
      this.cachedRecordsDateKey !== todayDateKey ||
      this.cachedStatsOverview === null ||
      this.cachedDailyRecords === null ||
      this.cachedTrend === null
    ) {
      this.cachedStatsOverview = this.statsStore.getOverview(now);
      this.cachedDailyRecords = this.buildDailyRecords(now);
      this.cachedTrend = createTrendPoints(this.statsStore.getRecentDays(14, now), now, 14);
      this.cachedRecordsDateKey = todayDateKey;
      this.recordsCacheDirty = false;
    }

    const todayStats = this.statsStore.getToday(now);
    return {
      nowIso: now.toISOString(),
      status,
      settings,
      todayStats,
      statsOverview: this.cachedStatsOverview!,
      dailyRecords: this.cachedDailyRecords!,
      trend: this.cachedTrend!,
      canRunReminders: workdayGate.canRunReminders,
      scheduleReason: schedule.reason,
      remainingSeconds: resolvedRemainingSeconds,
      countdownDurationSeconds: status === 'countdown' ? this.countdownDurationSeconds : null,
      nextReminderAtIso,
      pauseUntilIso: runtimeState.pauseUntilIso,
      mutedToday: runtimeState.mutedDateKey === todayDateKey,
      isOvertime,
      overtimeAutoEndSeconds: isOvertime ? Math.max(0, settings.overtimeAutoEndMinutes * 60 - idleSeconds) : null,
      consecutiveSnoozes: this.consecutiveSnoozes,
      currentCompletionStreak: todayStats.currentCompletionStreak,
      imageFallbackActive: this.deps.isImageFallbackActive(),
      daySession,
      dailyPoem: this.poemStore.getToday(now),
      dailyPoemRefresh: this.getDailyPoemRefreshState(now),
      fullscreenRest: status === 'fullscreen' ? this.getFullscreenRestState(now, settings) : null,
      restExercise: status === 'fullscreen' && settings.guidedRestEnabled ? this.getRestExercise(now) : null,
      focusContext: this.getFocusContext(),
      idleSeconds,
      imageRevision: this.imageRevision
    };
  }

  private getFullscreenRestState(now: Date, settings: AppSettings): FullscreenRestState {
    if (this.fullscreenRestStartedAt === null) {
      return {
        phase: 'prompt' as const,
        startedAtIso: null,
        remainingSeconds: settings.minimumRestSeconds,
        minimumRestSeconds: settings.minimumRestSeconds,
        canComplete: false
      };
    }

    const remainingSeconds = secondsUntil(now, this.fullscreenRestStartedAt + settings.minimumRestSeconds * 1000);
    return {
      phase: remainingSeconds > 0 ? 'resting' as const : 'ready' as const,
      startedAtIso: new Date(this.fullscreenRestStartedAt).toISOString(),
      remainingSeconds,
      minimumRestSeconds: settings.minimumRestSeconds,
      canComplete: remainingSeconds === 0
    };
  }

  private canCompleteFullscreenRest(now: Date): boolean {
    const settings = this.settingsStore.get();
    return this.fullscreenRestStartedAt !== null && this.getFullscreenRestState(now, settings).canComplete;
  }

  private getRestDurationSeconds(now: Date): number {
    return this.fullscreenRestStartedAt === null
      ? 0
      : Math.max(0, Math.floor((now.getTime() - this.fullscreenRestStartedAt) / 1000));
  }

  private getCurrentReminderDate(fallback: Date): Date {
    return this.currentReminderStartedAt === null
      ? fallback
      : new Date(this.currentReminderStartedAt);
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

    if (idleSeconds < settings.overtimeAutoEndMinutes * 60) {
      return false;
    }

    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.snoozeUntil = null;
    this.fullscreenRestStartedAt = null;

    const endedAt = getOvertimeEndDate(now, settings, idleSeconds);
    this.recordCurrentFocus(endedAt);
    this.daySessionStore.end(endedAt);
    this.activeWorkdayDateKey = null;
    this.activeWorkdayIsLive = false;
    this.invalidateRecordsCache();
    this.resetCycle(now);
    this.emitSnapshot(this.buildSnapshot(now, 'off-work', null, idleSeconds));
    return true;
  }

  private maybeClosePreviousWorkday(now: Date, settings: AppSettings, idleSeconds: number): void {
    const dateKey = this.activeWorkdayDateKey;
    if (
      dateKey === null ||
      dateKey === getDateKey(now) ||
      this.phase === 'countdown' ||
      this.phase === 'fullscreen'
    ) {
      return;
    }

    const session = this.daySessionStore.getRecentDays(30, now)[dateKey];
    if (session?.status === 'working') {
      const scheduledEnd = getScheduledWorkEndDate(new Date(`${dateKey}T12:00:00`), settings);
      const endedAt = this.activeWorkdayIsLive
        ? getWorkdayBoundaryEndDate(dateKey, now, scheduledEnd, idleSeconds)
        : scheduledEnd;
      this.daySessionStore.setDay(dateKey, {
        ...session,
        status: 'off-work',
        endedAtIso: endedAt.toISOString()
      });
      this.invalidateRecordsCache();
    }

    this.activeWorkdayDateKey = null;
    this.activeWorkdayIsLive = false;
    this.phase = 'running';
    this.snoozeUntil = null;
    this.currentReminderStartedAt = null;
    this.lastWithinSchedule = false;
    this.cycleStartedAt = null;
    this.persistRuntimeSession(now);
  }

  private invalidateRecordsCache(): void {
    this.recordsCacheDirty = true;
  }

  private getFocusContext(): FocusContextState {
    return this.deps.getFocusContext?.() ?? { active: false, reason: null, appName: null };
  }

  private getRestExercise(now: Date) {
    const seed = Number(getDateKey(this.getCurrentReminderDate(now)).replace(/-/g, '')) + this.statsStore.getToday(now).reminders;
    return REST_EXERCISES[Math.abs(seed) % REST_EXERCISES.length];
  }

  private persistRuntimeSession(now: Date): void {
    this.runtimeStateStore.setSession({
      cycleStartedAtIso: this.cycleStartedAt === null ? null : new Date(this.cycleStartedAt).toISOString(),
      snoozeUntilIso: this.snoozeUntil === null ? null : new Date(this.snoozeUntil).toISOString(),
      reminderStartedAtIso: this.currentReminderStartedAt === null ? null : new Date(this.currentReminderStartedAt).toISOString(),
      reminderPhase: this.phase === 'snoozed'
        ? 'snoozed'
        : this.phase === 'countdown' || this.phase === 'fullscreen'
          ? 'pending'
          : 'running',
      consecutiveSnoozes: this.consecutiveSnoozes
    }, now);
  }

  private buildDailyRecords(now: Date): DailyDetailRecord[] {
    const limit = 30;
    const statsByDay = this.statsStore.getRecentDays(limit, now);
    const sessionsByDay = this.daySessionStore.getRecentDays(limit, now);

    return getRecentDateKeys(limit, now)
      .map((dateKey) => {
        const stats = statsByDay[dateKey] ?? {
          reminders: 0,
          completed: 0,
          skipped: 0,
          snoozed: 0,
          interrupted: 0,
          restSeconds: 0,
          longestFocusSeconds: 0,
          currentCompletionStreak: 0
        };
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
          snoozed: stats.snoozed,
          interrupted: stats.interrupted,
          restSeconds: stats.restSeconds,
          longestFocusSeconds: stats.longestFocusSeconds,
          currentCompletionStreak: stats.currentCompletionStreak,
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

function getWorkdayBoundaryEndDate(dateKey: string, now: Date, scheduledEnd: Date, idleSeconds: number): Date {
  const workday = new Date(`${dateKey}T12:00:00`);
  const nextDayStartedAt = new Date(workday.getFullYear(), workday.getMonth(), workday.getDate() + 1);
  const lastActiveAt = new Date(now.getTime() - Math.max(0, idleSeconds) * 1000);
  const boundedLastActiveAt = new Date(Math.min(lastActiveAt.getTime(), nextDayStartedAt.getTime()));
  return boundedLastActiveAt.getTime() > scheduledEnd.getTime() ? boundedLastActiveAt : scheduledEnd;
}

function getScheduledWorkEndDate(date: Date, settings: AppSettings): Date {
  const schedule = getEffectiveSchedule(date, settings);
  const startMinutes = parseTimeToMinutes(schedule.start);
  const endMinutes = parseTimeToMinutes(schedule.end);
  const endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, endMinutes, 0, 0);

  if (endMinutes <= startMinutes && parseTimeToMinutes(formatTime(date)) < startMinutes) {
    return endDate;
  }

  if (endMinutes <= startMinutes) {
    endDate.setDate(endDate.getDate() + 1);
  }

  return endDate;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parsePastTimestamp(value: string | null, now: Date): number | null {
  const timestamp = parseTimestamp(value);
  return timestamp !== null && timestamp <= now.getTime() ? timestamp : null;
}

function normalizeDailyRecordCorrection(correction: DailyRecordCorrection): DailyRecordCorrection {
  const reminders = normalizeRecordCount(correction.reminders);
  const completed = Math.min(normalizeRecordCount(correction.completed), reminders);
  const skipped = Math.min(normalizeRecordCount(correction.skipped), reminders - completed);

  return {
    ...correction,
    reminders,
    completed,
    skipped,
    snoozed: normalizeRecordCount(correction.snoozed),
    interrupted: normalizeRecordCount(correction.interrupted),
    restSeconds: normalizeRecordCount(correction.restSeconds),
    longestFocusSeconds: normalizeRecordCount(correction.longestFocusSeconds)
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
    record.skipped > 0 ||
    record.snoozed > 0 ||
    record.interrupted > 0 ||
    record.restSeconds > 0
  );
}
