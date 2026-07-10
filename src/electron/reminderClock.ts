export type ReminderTimerHandle = ReturnType<typeof setTimeout> | number;

export interface ReminderClock {
  now: () => Date;
  setTimeout: (callback: () => void, delayMs: number) => ReminderTimerHandle;
  clearTimeout: (handle: ReminderTimerHandle) => void;
  setInterval: (callback: () => void, intervalMs: number) => ReminderTimerHandle;
  clearInterval: (handle: ReminderTimerHandle) => void;
}

export const systemReminderClock: ReminderClock = {
  now: () => new Date(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle)
};
