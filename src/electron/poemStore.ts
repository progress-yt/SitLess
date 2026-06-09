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

interface JinrishiciSentenceResponse {
  status?: string;
  data?: {
    content?: string;
    origin?: {
      title?: string;
      dynasty?: string;
      author?: string;
    };
  };
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

  async refreshToday(date = new Date()): Promise<DailyPoem> {
    const dateKey = getDateKey(date);
    if (this.state.poem?.dateKey === dateKey && this.state.poem.source === 'jinrishici') {
      return this.getToday(date);
    }

    try {
      const token = await this.getToken();
      const poem = await fetchDailyPoem(token, dateKey);
      this.state = {
        ...this.state,
        poem
      };
      this.persist();
      return poem;
    } catch {
      const fallback = this.state.poem?.dateKey === dateKey ? this.state.poem : createFallbackDailyPoem(dateKey);
      this.state = {
        ...this.state,
        poem: fallback
      };
      this.persist();
      return fallback;
    }
  }

  private async getToken(): Promise<string> {
    if (this.state.token) {
      return this.state.token;
    }

    const response = await net.fetch('https://v2.jinrishici.com/token');
    if (!response.ok) {
      throw new Error(`Token request failed with HTTP ${response.status}`);
    }

    const token = (await response.text()).trim();
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

async function fetchDailyPoem(token: string, dateKey: string): Promise<DailyPoem> {
  const response = await net.fetch('https://v2.jinrishici.com/sentence', {
    headers: {
      'X-User-Token': token
    }
  });

  if (!response.ok) {
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

function normalizePoemFile(value: Partial<PoemFile>): PoemFile {
  return {
    token: typeof value.token === 'string' ? value.token : null,
    poem: value.poem ? normalizePoem(value.poem) : null
  };
}

function normalizePoem(value: Partial<DailyPoem>): DailyPoem | null {
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
