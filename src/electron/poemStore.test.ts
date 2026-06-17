import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoemStore } from './poemStore';

const electronMock = vi.hoisted(() => ({
  userDataPath: '',
  fetch: vi.fn()
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.userDataPath
  },
  net: {
    fetch: electronMock.fetch
  }
}));

describe('PoemStore', () => {
  let userDataPath: string;

  beforeEach(() => {
    userDataPath = mkdtempSync(join(tmpdir(), 'sitless-poem-'));
    electronMock.userDataPath = userDataPath;
    electronMock.fetch.mockReset();
  });

  afterEach(() => {
    rmSync(userDataPath, { recursive: true, force: true });
  });

  it('refreshes the token and retries when the cached token is rejected', async () => {
    writeFileSync(
      join(userDataPath, 'daily-poem.json'),
      JSON.stringify({
        token: 'stale-token',
        poem: null
      }),
      'utf8'
    );

    const usedTokens: Array<string | null> = [];
    electronMock.fetch.mockImplementation(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.endsWith('/token')) {
        return jsonResponse({ status: 'success', data: 'fresh-token' });
      }

      const token = init?.headers?.['X-User-Token'] ?? null;
      usedTokens.push(token);
      if (token === 'stale-token') {
        return jsonResponse({
          status: 'error',
          statusCode: 400,
          errCode: 2004,
          errMessage: '您未正确附带 Token，请检查程序'
        }, 400);
      }

      return jsonResponse({
        status: 'success',
        data: {
          content: '重新取 token 后的诗句',
          origin: {
            author: '测试',
            title: '重试'
          }
        }
      });
    });

    const store = new PoemStore();
    const poem = await store.refreshToday(new Date('2026-06-10T10:00:00'), { force: true });

    expect(poem).toMatchObject({
      content: '重新取 token 后的诗句',
      source: 'jinrishici'
    });
    expect(usedTokens).toEqual(['stale-token', 'fresh-token']);
    expect(JSON.parse(readFileSync(join(userDataPath, 'daily-poem.json'), 'utf8')).token).toBe('fresh-token');
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}
