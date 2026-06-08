import { EventEmitter } from 'node:events';
import { getScheduleStatus, secondsUntil } from '../shared/schedule';
import { getWorkdayGateStatus } from '../shared/workday';
import type { AppSnapshot, AppStatus, CountdownAction, WorkdayStatus } from '../shared/types';
import type { SettingsStore } from './settingsStore';
import type { StatsStore } from './statsStore';

interface ReminderControllerDeps {
  getIdleSeconds: () => number;
  showNotification: () => void;
  openCountdown: () => void;
  closeCountdown: () => void;
  openFullscreen: () => void;
  closeFullscreen: () => void;
}

type RuntimePhase = 'running' | 'snoozed' | 'countdown' | 'fullscreen';

export class ReminderController extends EventEmitter {
  private phase: RuntimePhase = 'running';
  private cycleStartedAt: number | null = null;
  private pauseUntil: number | null = null;
  private snoozeUntil: number | null = null;
  private mutedDateKey: string | null = null;
  private lastWithinSchedule = false;
  private countdownTimer: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;
  private currentReminderCountsStats = true;
  private snapshot: AppSnapshot;
  private imageRevision = 0;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly statsStore: StatsStore,
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

  pauseForHour(): AppSnapshot {
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.pauseUntil = Date.now() + 60 * 60 * 1000;
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  muteToday(): AppSnapshot {
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.phase = 'running';
    this.mutedDateKey = localDateKey(new Date());
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  startWorkday(): AppSnapshot {
    this.setWorkdayStatus('working');
    this.mutedDateKey = null;
    this.phase = 'running';
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  endWorkday(): AppSnapshot {
    this.clearCountdownTimer();
    this.deps.closeCountdown();
    this.deps.closeFullscreen();
    this.setWorkdayStatus('off-work');
    this.phase = 'running';
    this.resetCycle(new Date());
    this.tick();
    return this.snapshot;
  }

  testReminderFlow(): AppSnapshot {
    this.triggerReminder(false);
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

    if (this.mutedDateKey && this.mutedDateKey !== localDateKey(now)) {
      this.mutedDateKey = null;
    }

    if (this.phase === 'countdown') {
      this.emitSnapshot(this.buildSnapshot(now, 'countdown', null, idleSeconds));
      return;
    }

    if (this.phase === 'fullscreen') {
      this.emitSnapshot(this.buildSnapshot(now, 'fullscreen', null, idleSeconds));
      return;
    }

    const workdayStatus = this.getWorkdayStatus(now);
    const workdayGate = getWorkdayGateStatus(now, settings, workdayStatus);
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

    if (this.mutedDateKey === localDateKey(now)) {
      this.emitSnapshot(this.buildSnapshot(now, 'muted-today', null, idleSeconds));
      return;
    }

    if (this.pauseUntil && this.pauseUntil > now.getTime()) {
      this.emitSnapshot(this.buildSnapshot(now, 'paused', secondsUntil(now, this.pauseUntil), idleSeconds));
      return;
    }

    if (this.pauseUntil && this.pauseUntil <= now.getTime()) {
      this.pauseUntil = null;
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

    if (settings.mode === 'active') {
      const idleResetSeconds = settings.idleResetMinutes * 60;
      if (idleSeconds > idleResetSeconds) {
        this.cycleStartedAt = null;
        this.emitSnapshot(this.buildSnapshot(now, 'idle-reset', settings.activeThresholdMinutes * 60, idleSeconds));
        return;
      }

      if (this.cycleStartedAt === null) {
        this.resetCycle(now);
      }

      const cycleStartedAt = this.cycleStartedAt ?? now.getTime();
      this.cycleStartedAt = cycleStartedAt;
      const elapsedSeconds = Math.floor((now.getTime() - cycleStartedAt) / 1000);
      const remainingSeconds = settings.activeThresholdMinutes * 60 - elapsedSeconds;

      if (remainingSeconds <= 0) {
        this.triggerReminder(true);
        return;
      }

      this.emitSnapshot(this.buildSnapshot(now, 'counting', remainingSeconds, idleSeconds));
      return;
    }

    if (this.cycleStartedAt === null) {
      this.resetCycle(now);
    }

    const cycleStartedAt = this.cycleStartedAt ?? now.getTime();
    this.cycleStartedAt = cycleStartedAt;
    const elapsedSeconds = Math.floor((now.getTime() - cycleStartedAt) / 1000);
    const remainingSeconds = settings.fixedIntervalMinutes * 60 - elapsedSeconds;

    if (remainingSeconds <= 0) {
      this.triggerReminder(true);
      return;
    }

    this.emitSnapshot(this.buildSnapshot(now, 'counting', remainingSeconds, idleSeconds));
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
    const workdayStatus = this.getWorkdayStatus(now);
    const workdayGate = getWorkdayGateStatus(now, settings, workdayStatus);
    const nextReminderAtIso =
      status === 'counting' && remainingSeconds !== null
        ? new Date(now.getTime() + remainingSeconds * 1000).toISOString()
        : null;

    return {
      nowIso: now.toISOString(),
      status,
      settings,
      todayStats: this.statsStore.getToday(now),
      isWithinSchedule: workdayGate.canRunReminders,
      scheduleReason: schedule.reason,
      remainingSeconds,
      nextReminderAtIso,
      pauseUntilIso: this.pauseUntil ? new Date(this.pauseUntil).toISOString() : null,
      mutedToday: this.mutedDateKey === localDateKey(now),
      workdayStatus,
      idleSeconds,
      imageRevision: this.imageRevision
    };
  }

  private getWorkdayStatus(date: Date): WorkdayStatus {
    return this.statsStore.getToday(date).workdayStatus;
  }

  private setWorkdayStatus(status: WorkdayStatus): void {
    this.statsStore.setWorkdayStatus(status);
  }

  private emitSnapshot(snapshot: AppSnapshot): void {
    this.snapshot = snapshot;
    this.emit('snapshot', snapshot);
  }
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
