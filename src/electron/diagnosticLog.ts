import { app } from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeDiagnosticLog(event: string, detail?: string): void {
  try {
    const suffix = detail ? ` ${detail.replace(/[\r\n]+/g, ' ').slice(0, 500)}` : '';
    appendFileSync(
      join(app.getPath('userData'), 'sitless.log'),
      `${new Date().toISOString()} ${event}${suffix}\n`,
      'utf8'
    );
  } catch {
    // Diagnostics must never prevent startup or shutdown.
  }
}
