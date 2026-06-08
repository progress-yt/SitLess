/// <reference types="vite/client" />

import type { SitlessApi } from '../electron/preload';

declare global {
  interface Window {
    sitless?: SitlessApi;
  }
}
