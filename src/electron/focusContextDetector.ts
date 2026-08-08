import { execFile } from 'node:child_process';
import type { FocusContextState } from '../shared/types';

const EMPTY_CONTEXT: FocusContextState = { active: false, reason: null, appName: null };
const MEETING_APPS = new Set(['zoom', 'webexmta']);
const COLLABORATION_APPS = new Set(['teams', 'ms-teams', 'webex', 'skype', 'slack']);
const MEETING_TITLE_PATTERN = /(?:meeting|call|huddle|会议|通话|通话中)/i;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 60_000;
const POWERSHELL_SCRIPT = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class SitLessWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@
Add-Type -AssemblyName System.Windows.Forms
$handle = [SitLessWin32]::GetForegroundWindow()
$rect = New-Object SitLessWin32+RECT
$pidValue = 0
[void][SitLessWin32]::GetWindowRect($handle, [ref]$rect)
[void][SitLessWin32]::GetWindowThreadProcessId($handle, [ref]$pidValue)
$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
$bounds = [System.Windows.Forms.Screen]::FromHandle($handle).Bounds
$title = New-Object System.Text.StringBuilder 512
[void][SitLessWin32]::GetWindowText($handle, $title, $title.Capacity)
[pscustomobject]@{
  processName = $process.ProcessName
  windowTitle = $title.ToString()
  fullscreen = ($rect.Left -le $bounds.Left -and $rect.Top -le $bounds.Top -and $rect.Right -ge $bounds.Right -and $rect.Bottom -ge $bounds.Bottom)
} | ConvertTo-Json -Compress
`;

export class FocusContextDetector {
  private state: FocusContextState = EMPTY_CONTEXT;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private enabled = false;
  private consecutiveFailures = 0;

  start(): void {
    this.setEnabled(true);
  }

  stop(): void {
    this.setEnabled(false);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled && process.platform === 'win32';
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.enabled) {
      this.consecutiveFailures = 0;
      this.state = EMPTY_CONTEXT;
      return;
    }
    if (!this.inFlight) {
      void this.poll();
    }
  }

  getState = (): FocusContextState => ({ ...this.state });

  private async poll(): Promise<void> {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    try {
      const stdout = await executePowerShell(POWERSHELL_SCRIPT);
      if (this.enabled) {
        this.state = parseFocusContext(stdout);
        this.consecutiveFailures = 0;
      }
    } catch {
      if (this.enabled) {
        this.state = EMPTY_CONTEXT;
        this.consecutiveFailures += 1;
      }
    } finally {
      this.inFlight = false;
      if (this.enabled) {
        this.timer = setTimeout(
          () => void this.poll(),
          getFocusPollDelay(this.consecutiveFailures)
        );
      }
    }
  }
}

export function parseFocusContext(value: string): FocusContextState {
  try {
    const parsed = JSON.parse(value.trim()) as {
      processName?: unknown;
      windowTitle?: unknown;
      fullscreen?: unknown;
    };
    const appName = typeof parsed.processName === 'string' && parsed.processName.trim()
      ? parsed.processName.trim()
      : null;
    const normalizedName = appName?.toLowerCase() ?? '';
    const windowTitle = typeof parsed.windowTitle === 'string' ? parsed.windowTitle : '';
    if (
      MEETING_APPS.has(normalizedName)
      || (COLLABORATION_APPS.has(normalizedName) && MEETING_TITLE_PATTERN.test(windowTitle))
    ) {
      return { active: true, reason: 'meeting-app', appName };
    }
    if (parsed.fullscreen === true && normalizedName !== 'explorer') {
      return { active: true, reason: 'fullscreen-app', appName };
    }
    return { active: false, reason: null, appName };
  } catch {
    return EMPTY_CONTEXT;
  }
}

export function getFocusPollDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return POLL_INTERVAL_MS;
  }
  return Math.min(POLL_INTERVAL_MS * (2 ** consecutiveFailures), MAX_POLL_INTERVAL_MS);
}

function executePowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 4000,
      maxBuffer: 64 * 1024
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}
