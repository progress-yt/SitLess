/// <reference types="vite/client" />

import type { SitlessApi } from '../shared/ipc';

declare global {
  interface Window {
    sitless?: SitlessApi;
  }
}
