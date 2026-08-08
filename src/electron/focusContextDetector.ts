import { execFile } from 'node:child_process';
import type { FocusContextState } from '../shared/types';

const EMPTY_CONTEXT: FocusContextState = { active: false, reason: null, appName: null };
const MEETING_APPS = new Set(['teams', 'ms-teams', 'zoom', 'webex', 'webexmta', 'skype', 'slack']);
const POWERSHELL_SCRIPT = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class SitLessWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
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
[pscustomobject]@{
  processName = $process.ProcessName
  fullscreen = ($rect.Left -le $bounds.Left -and $rect.Top -le $bounds.Top -and $rect.Right -ge $bounds.Right -and $rect.Bottom -ge $bounds.Bottom)
} | ConvertTo-Json -Compress
`;

export class FocusContextDetector {
  private state: FocusContextState = EMPTY_CONTEXT;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  start(): void {
    if (process.platform !== 'win32' || this.timer) {
      return;
    }
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 5000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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
      this.state = parseFocusContext(stdout);
    } catch {
      this.state = EMPTY_CONTEXT;
    } finally {
      this.inFlight = false;
    }
  }
}

export function parseFocusContext(value: string): FocusContextState {
  try {
    const parsed = JSON.parse(value.trim()) as { processName?: unknown; fullscreen?: unknown };
    const appName = typeof parsed.processName === 'string' && parsed.processName.trim()
      ? parsed.processName.trim()
      : null;
    const normalizedName = appName?.toLowerCase() ?? '';
    if (MEETING_APPS.has(normalizedName)) {
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

function executePowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 4000,
      maxBuffer: 64 * 1024
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}
