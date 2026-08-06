import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function getTrustedDevServerUrl(value: string | undefined, isPackaged: boolean): string | null {
  if (!value || isPackaged) {
    return null;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
    if (url.protocol !== 'http:' || !isLoopback || url.username || url.password) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function isTrustedRendererUrl(
  value: string,
  rendererFileUrl: string,
  devServerUrl: string | null
): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'file:') {
      return normalizeFilePath(url) === normalizeFilePath(new URL(rendererFileUrl));
    }

    return devServerUrl !== null && url.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}

function normalizeFilePath(url: URL): string {
  return resolve(fileURLToPath(url)).toLowerCase();
}
