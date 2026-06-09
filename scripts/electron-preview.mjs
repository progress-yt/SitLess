import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let userDataDir = join(root, '.tmp-preview-user-data');

if (process.argv.includes('--fresh') && existsSync(userDataDir)) {
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch {
    console.warn('Preview userData is in use; starting against the existing preview instance.');
  }
}

const build = spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd run build'], {
  cwd: root,
  stdio: 'inherit',
  shell: false
});

if (build.error) {
  console.error(build.error);
  process.exit(1);
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const child = spawn(require('electron'), ['.'], {
  cwd: root,
  env: {
    ...process.env,
    SITLESS_USER_DATA_DIR: userDataDir,
    SITLESS_SKIP_STARTUP_PROMPT: '1'
  },
  detached: true,
  stdio: 'ignore',
  windowsHide: true
});

child.unref();
console.log(`SitLess preview started with userData=${userDataDir}`);
