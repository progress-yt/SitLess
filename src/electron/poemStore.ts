import { app, net } from 'electron';
import { join } from 'node:path';
import { createFallbackDailyPoem } from '../shared/defaults';
import { getDateKey } from '../shared/schedule';
import type { DailyPoem } from '../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

interface PoemFile {
  token: string | null;
  poem: DailyPoem | null;
}

interface PoemRefreshOptions {
  force?: boolean;
}

interface JinrishiciSentenceResponse {
  status?: string;
  statusCode?: number;
  errCode?: number;
  errMessage?: string;
  data?: {
    content?: string;
    origin?: {
      title?: string;
      dynasty?: string;
      author?: string;
    };
  };
}

interface JinrishiciTokenResponse {
  status?: string;
  data?: string;
}

export class PoemStore {
  private readonly filePath: string;
  private state: PoemFile;

  constructor() {
    this.filePath = join(app.getPath('userData'), 'daily-poem.json');
    this.state = normalizePoemFile(readJsonFile(this.filePath, { token: null, poem: null }));
  }

  getToday(date = new Date()): DailyPoem {
    const dateKey = getDateKey(date);
    if (this.state.poem?.dateKey === dateKey) {
      return {
        ...this.state.poem,
        source: this.state.poem.source === 'jinrishici' ? 'cache' : this.state.poem.source
      };
    }

    return createFallbackDailyPoem(dateKey);
  }

  async refreshToday(date = new Date(), options: PoemRefreshOptions = {}): Promise<DailyPoem> {
    const dateKey = getDateKey(date);
    if (!options.force && this.state.poem?.dateKey === dateKey && this.state.poem.source === 'jinrishici') {
      return this.getToday(date);
    }

    try {
      const poem = await this.refreshRemotePoem(dateKey);
      this.state = {
        ...this.state,
        poem
      };
      this.persist();
      return poem;
    } catch {
      const fallback = this.state.poem?.dateKey === dateKey
        ? {
            ...this.state.poem,
            source: this.state.poem.source === 'jinrishici' ? 'cache' : this.state.poem.source
          }
        : createFallbackDailyPoem(dateKey);
      this.state = {
        ...this.state,
        poem: fallback
      };
      this.persist();
      return fallback;
    }
  }

  private async refreshRemotePoem(dateKey: string): Promise<DailyPoem> {
    const token = await this.getToken();
    try {
      return await fetchDailyPoem(token, dateKey);
    } catch (error) {
      if (!(error instanceof TokenRejectedError)) {
        throw error;
      }

      const freshToken = await this.getToken({ force: true });
      return fetchDailyPoem(freshToken, dateKey);
    }
  }

  private async getToken(options: { force?: boolean } = {}): Promise<string> {
    if (this.state.token && !options.force) {
      return this.state.token;
    }

    const response = await net.fetch('https://v2.jinrishici.com/token');
    if (!response.ok) {
      throw new Error(`Token request failed with HTTP ${response.status}`);
    }

    const json = await response.json() as JinrishiciTokenResponse;
    const token = json.data?.trim();
    if (!token) {
      throw new Error('Token request returned an empty token');
    }

    this.state = {
      ...this.state,
      token
    };
    this.persist();
    return token;
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.state);
  }
}

class TokenRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenRejectedError';
  }
}

async function fetchDailyPoem(token: string, dateKey: string): Promise<DailyPoem> {
  const response = await net.fetch('https://v2.jinrishici.com/sentence', {
    headers: {
      'X-User-Token': token
    }
  });

  if (!response.ok) {
    const json = await readJsonResponse<JinrishiciSentenceResponse>(response);
    if (isTokenRejectedResponse(response.status, json)) {
      throw new TokenRejectedError(json?.errMessage || `Poem token rejected with HTTP ${response.status}`);
    }

    throw new Error(`Poem request failed with HTTP ${response.status}`);
  }

  const json = await response.json() as JinrishiciSentenceResponse;
  const content = json.data?.content?.trim();
  if (!content) {
    throw new Error('Poem response did not include content');
  }

  return {
    dateKey,
    content,
    author: json.data?.origin?.author?.trim() || null,
    title: json.data?.origin?.title?.trim() || null,
    source: 'jinrishici'
  };
}

async function readJsonResponse<T>(response: Awaited<ReturnType<typeof net.fetch>>): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function isTokenRejectedResponse(status: number, json: JinrishiciSentenceResponse | null): boolean {
  return (
    status === 400 &&
    (json?.errCode === 2004 || json?.errMessage?.toLowerCase().includes('token') === true)
  );
}

function normalizePoemFile(value: unknown): PoemFile {
  const object = isRecord(value) ? value : {};
  return {
    token: typeof object.token === 'string' ? object.token : null,
    poem: object.poem ? normalizePoem(object.poem) : null
  };
}

function normalizePoem(value: unknown): DailyPoem | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.dateKey !== 'string' || typeof value.content !== 'string') {
    return null;
  }

  return {
    dateKey: value.dateKey,
    content: value.content,
    author: typeof value.author === 'string' ? value.author : null,
    title: typeof value.title === 'string' ? value.title : null,
    source: value.source === 'jinrishici' || value.source === 'cache' || value.source === 'fallback' ? value.source : 'fallback'
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
