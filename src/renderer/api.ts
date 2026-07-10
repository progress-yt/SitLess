import type { SitlessApi } from '../shared/ipc';
import { createBrowserFallbackApi } from './browserFallbackApi';

export const sitlessApi: SitlessApi = window.sitless ?? createBrowserFallbackApi();
