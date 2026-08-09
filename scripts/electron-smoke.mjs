import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const userDataDir = join(root, '.tmp-electron-smoke');
const port = 9333;

if (existsSync(userDataDir)) {
  await removeUserDataDirectory(true);
}

const child = spawn(electronPath, ['--remote-debugging-port=9333', '--no-sandbox', '.'], {
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
const childExit = new Promise((resolveExit) => {
  child.once('exit', () => {
    childExited = true;
    resolveExit();
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
  const mainTarget = await waitForTarget(
    'main',
    "document.body.innerText.includes('SitLess') && document.body.innerText.length >= 20",
    'main window content'
  );

  await verifyMainWindow(mainTarget.webSocketDebuggerUrl);
  await verifyReminderFlow(mainTarget.webSocketDebuggerUrl);
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
    await removeUserDataDirectory(false);
  }
}

async function verifyMainWindow(webSocketUrl) {
  await waitForExpression(
    webSocketUrl,
    `(() => {
      const metrics = [...document.querySelectorAll('.metric-row > span')].map((item) => item.textContent?.trim());
      const periods = [...document.querySelectorAll('[aria-label="统计周期"] button')].map((item) => item.textContent?.trim());
      return ['提醒', '已起身', '跳过', '稍后', '中断', '休息时长', '最长久坐', '连续完成']
        .every((label) => metrics.includes(label)) && periods.join(',') === '日,周,月';
    })()`,
    'home statistics'
  );
  await clickButton(webSocketUrl, '周');
  await waitForExpression(webSocketUrl, "document.body.innerText.includes('本周统计')", 'weekly statistics');
  await clickButton(webSocketUrl, '月');
  await waitForExpression(webSocketUrl, "document.body.innerText.includes('本月统计')", 'monthly statistics');
  await clickButton(webSocketUrl, '趋势');
  await waitForExpression(
    webSocketUrl,
    "document.querySelectorAll('.trend-column').length === 14 && document.body.innerText.includes('休息与完成趋势')",
    'fourteen day trend'
  );
  await clickButton(webSocketUrl, '状态');
  await clickButton(webSocketUrl, '设置');
  await waitForExpression(
    webSocketUrl,
    "document.body.innerText.includes('加班无输入自动下班') && document.body.innerText.includes('测试提醒流程')",
    'settings controls'
  );

  await setNumberFieldsTogether(webSocketUrl, [
    { label: '加班无输入自动下班', value: 17 },
    { label: '倒计时', value: 4 }
  ]);
  await waitForStoredSettings((settings) =>
    settings.overtimeAutoEndMinutes === 17 && settings.countdownSeconds === 4
  );
  await clickButton(webSocketUrl, '照片 1真实办公空间');
  await waitForStoredSettings((settings) => settings.builtInReminderImageId === 'photo-1');
  await waitForExpression(
    webSocketUrl,
    `(() => {
      const active = [...document.querySelectorAll('.built-in-image-options button')]
        .find((button) => button.textContent?.includes('照片 1'));
      const preview = document.querySelector('.image-preview');
      return active?.classList.contains('active')
        && preview instanceof HTMLImageElement
        && preview.complete
        && preview.naturalWidth > 0;
    })()`,
    'built-in reminder image preview'
  );
  await clickButton(webSocketUrl, '办公桌柔和室内场景');
  await waitForStoredSettings((settings) => settings.builtInReminderImageId === 'desk');
  await clickButton(webSocketUrl, '详细记录');
  await waitForExpression(
    webSocketUrl,
    "document.body.innerText.includes('最近 30 天') && [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('编辑'))",
    'records view'
  );
  await clickButton(webSocketUrl, '编辑');
  await waitForExpression(
    webSocketUrl,
    "Boolean(document.querySelector('.record-edit-panel')) && document.body.innerText.includes('保存') && document.body.innerText.includes('取消')",
    'record edit controls'
  );

  await clickButton(webSocketUrl, '设置');
  await waitForExpression(
    webSocketUrl,
    `(() => {
      const values = Object.fromEntries([...document.querySelectorAll('label')].map((label) => [
        label.querySelector('span')?.textContent?.trim(),
        label.querySelector('input')?.value
      ]));
      return values['加班无输入自动下班'] === '17';
    })()`,
    'overtime setting reflected after navigation'
  );

  await setNumberField(webSocketUrl, '倒计时', 3);
  await clickButton(webSocketUrl, '详细记录');
  await clickButton(webSocketUrl, '设置');
  await waitForExpression(
    webSocketUrl,
    `(() => {
      const values = Object.fromEntries([...document.querySelectorAll('label')].map((label) => [
        label.querySelector('span')?.textContent?.trim(),
        label.querySelector('input')?.value
      ]));
      return values['加班无输入自动下班'] === '17' && values['倒计时'] === '3';
    })()`,
    'settings reflected after navigation'
  );
}

async function verifyReminderFlow(mainWebSocketUrl) {
  await clickButton(mainWebSocketUrl, '设置');
  await waitForExpression(
    mainWebSocketUrl,
    "document.body.innerText.includes('测试提醒流程')",
    'test reminder action'
  );
  await clickButton(mainWebSocketUrl, '测试提醒流程');
  const reminderStartedAt = Date.now();

  const countdownTarget = await waitForTarget(
    'countdown',
    "['开始休息', '稍后提醒', '跳过本次'].every((label) => document.body.innerText.includes(label))",
    'countdown actions'
  );

  const fullscreenTarget = await waitForTarget(
    'fullscreen',
    "document.body.innerText.includes('起身休息一会儿') && document.body.innerText.includes('临时返回工作')",
    'fullscreen custom actions'
  );
  if (Date.now() - reminderStartedAt > 8000) {
    throw new Error('Updated countdown setting was not applied to the reminder flow');
  }

  await clickButton(fullscreenTarget.webSocketDebuggerUrl, '起身休息一会儿');
  await waitForExpression(
    fullscreenTarget.webSocketDebuggerUrl,
    "document.body.innerText.includes('还需') && document.body.innerText.includes('临时返回工作')",
    'fullscreen rest state'
  );
  await clickButton(fullscreenTarget.webSocketDebuggerUrl, '临时返回工作');
  await waitForTargetClosed('fullscreen');
  await waitForExpression(
    mainWebSocketUrl,
    "document.body.innerText.includes('SitLess') && Boolean(document.querySelector('.status-band h2'))",
    'main window after interrupting rest'
  );
}

async function setNumberField(webSocketUrl, label, value) {
  const focused = await evaluate(webSocketUrl, `(() => {
    const field = [...document.querySelectorAll('label')].find((candidate) =>
      candidate.querySelector('span')?.textContent?.trim() === ${JSON.stringify(label)}
    );
    const input = field?.querySelector('input[type="number"]');
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '');
    input.focus();
    return document.activeElement === input;
  })()`);
  if (!focused) {
    throw new Error(`Could not update number field: ${label}`);
  }
  await sendCdpCommand(webSocketUrl, 'Input.insertText', {
    text: String(value)
  });
}

async function setNumberFieldsTogether(webSocketUrl, updates) {
  const updated = await evaluate(webSocketUrl, `(() => {
    const updates = ${JSON.stringify(updates)};
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    return updates.every(({ label, value }) => {
      const field = [...document.querySelectorAll('label')].find((candidate) =>
        candidate.querySelector('span')?.textContent?.trim() === label
      );
      const input = field?.querySelector('input[type="number"]');
      if (!(input instanceof HTMLInputElement) || !setter) {
        return false;
      }
      setter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
  })()`);
  if (!updated) {
    throw new Error('Could not update settings fields together');
  }
}

async function waitForStoredSettings(predicate) {
  const settingsPath = join(userDataDir, 'settings.json');
  const deadline = Date.now() + 10000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      if (predicate(settings)) {
        return;
      }
      lastError = new Error(`Stored settings did not contain the expected values: ${JSON.stringify(settings)}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }

  throw lastError ?? new Error('Timed out waiting for stored settings');
}

async function removeUserDataDirectory(required) {
  const retryableCodes = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);
  let lastError = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code)) {
        throw error;
      }
      await delay(250);
    }
  }

  if (required) {
    throw lastError;
  }

  console.warn(`electron-smoke cleanup deferred: ${lastError?.code ?? 'unknown error'}`);
}

async function waitForTarget(view, expression, description) {
  const deadline = Date.now() + 20000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const targets = await getPageTargets(view);
      for (const target of targets) {
        if (target.webSocketDebuggerUrl && await evaluate(target.webSocketDebuggerUrl, expression)) {
          return target;
        }
        if (target.webSocketDebuggerUrl) {
          const observation = await evaluate(
            target.webSocketDebuggerUrl,
            "({ url: location.href, state: document.readyState, text: document.body?.innerText ?? '', html: document.body?.innerHTML?.slice(0, 500) ?? '' })"
          );
          lastError = new Error(`Target did not satisfy ${description}: ${JSON.stringify(observation)}`);
        }
      }
      lastError ??= new Error(`No ${view} page target found for ${description}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  throw lastError ?? new Error(`Timed out waiting for ${description}`);
}

async function waitForTargetClosed(view) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if ((await getPageTargets(view)).length === 0) {
      return;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${view} window to close`);
}

async function waitForExpression(webSocketUrl, expression, description) {
  const deadline = Date.now() + 10000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      if (await evaluate(webSocketUrl, expression)) {
        return;
      }
      lastError = new Error(`Expression did not satisfy ${description}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }

  throw lastError ?? new Error(`Timed out waiting for ${description}`);
}

async function clickButton(webSocketUrl, label) {
  const clicked = await evaluate(webSocketUrl, `(() => {
    const expected = ${JSON.stringify(label)}.replace(/\\s+/g, '');
    const button = [...document.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.replace(/\\s+/g, '') === expected
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`Button not found: ${label}`);
  }
}

async function getPageTargets(view) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  return targets.filter((target) =>
    target.type === 'page' && target.url.includes(`view=${view}`)
  );
}

async function evaluate(webSocketUrl, expression) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  try {
    const response = await sendCdp(socket, {
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression,
        awaitPromise: true,
        returnByValue: true
      }
    });
    if (response.result?.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.exception?.description ?? 'Renderer evaluation failed');
    }
    return response.result?.result?.value;
  } finally {
    socket.close();
  }
}

async function sendCdpCommand(webSocketUrl, method, params) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  try {
    return await sendCdp(socket, {
      id: 1,
      method,
      params
    });
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
