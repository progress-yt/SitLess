import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const userDataDir = join(root, '.tmp-electron-smoke');
const port = 9333;

if (existsSync(userDataDir)) {
  rmSync(userDataDir, { recursive: true, force: true });
}

const child = spawn(electronPath, ['--remote-debugging-port=9333', '.'], {
  cwd: root,
  env: {
    ...process.env,
    SITLESS_USER_DATA_DIR: userDataDir,
    SITLESS_SKIP_GLOBAL_INSTANCE_LOCK: '1',
    SITLESS_SKIP_STARTUP_PROMPT: '1',
    SITLESS_SKIP_WORKDAY_PROMPT: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let childExited = false;
const childExit = new Promise((resolve) => {
  child.once('exit', () => {
    childExited = true;
    resolve();
  });
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const text = await waitForMainWindowText();
  console.log('electron-smoke ok');
} catch (error) {
  console.error('electron-smoke failed');
  console.error(error);
  if (stdout.trim()) {
    console.error(`stdout:\n${stdout}`);
  }
  if (stderr.trim()) {
    console.error(`stderr:\n${stderr}`);
  }
  process.exitCode = 1;
} finally {
  if (!childExited) {
    child.kill();
    await Promise.race([childExit, delay(5000)]);
  }
  if (existsSync(userDataDir)) {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

async function waitForMainWindowText() {
  const deadline = Date.now() + 20000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const page = targets.find((target) => target.type === 'page' && target.url.includes('index.html'));
      if (page?.webSocketDebuggerUrl) {
        const text = await evaluateText(page.webSocketDebuggerUrl);
        if (text.includes('SitLess') && text.length >= 20) {
          return text;
        }
        lastError = new Error(`Main window rendered empty or incomplete text: ${JSON.stringify(text)}`);
      }
    } catch (error) {
      lastError = error;
    }

    await delay(400);
  }

  throw lastError ?? new Error('Timed out waiting for Electron page target');
}

async function evaluateText(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  try {
    const result = await sendCdp(socket, {
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: 'document.body.innerText',
        returnByValue: true
      }
    });

    return result.result?.result?.value ?? '';
  } finally {
    socket.close();
  }
}

function sendCdp(socket, payload) {
  return new Promise((resolveMessage, rejectMessage) => {
    const timeout = setTimeout(() => rejectMessage(new Error(`CDP timeout for ${payload.method}`)), 5000);

    const onMessage = (event) => {
      const message = JSON.parse(event.data.toString());
      if (message.id !== payload.id) {
        return;
      }

      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      if (message.error) {
        rejectMessage(new Error(JSON.stringify(message.error)));
      } else {
        resolveMessage(message);
      }
    };

    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify(payload));
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
