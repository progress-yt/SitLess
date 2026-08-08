import { app } from 'electron';
import { join } from 'node:path';
import { appendRotatingLog } from './diagnosticLogFile';

export function writeDiagnosticLog(event: string, detail?: string): void {
  try {
    const suffix = detail ? ` ${detail.replace(/[\r\n]+/g, ' ').slice(0, 500)}` : '';
    appendRotatingLog(
      join(app.getPath('userData'), 'sitless.log'),
      `${new Date().toISOString()} ${event}${suffix}\n`
    );
  } catch {
    // Diagnostics must never prevent startup or shutdown.
  }
}
