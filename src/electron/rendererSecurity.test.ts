import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getTrustedDevServerUrl, isTrustedRendererUrl } from './rendererSecurity';

describe('renderer trust policy', () => {
  const rendererFileUrl = pathToFileURL('C:\\SitLess\\dist\\index.html').toString();

  it('only accepts the packaged renderer file and a loopback development origin', () => {
    const devServerUrl = getTrustedDevServerUrl('http://127.0.0.1:5173', false);

    expect(isTrustedRendererUrl(`${rendererFileUrl}?view=main`, rendererFileUrl, devServerUrl)).toBe(true);
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/?view=main', rendererFileUrl, devServerUrl)).toBe(true);
    expect(isTrustedRendererUrl('https://example.com/?view=main', rendererFileUrl, devServerUrl)).toBe(false);
    expect(isTrustedRendererUrl('file:///C:/other/index.html?view=main', rendererFileUrl, devServerUrl)).toBe(false);
  });

  it('rejects remote or packaged development server configuration', () => {
    expect(getTrustedDevServerUrl('https://example.com', false)).toBeNull();
    expect(getTrustedDevServerUrl('http://127.0.0.1:5173', true)).toBeNull();
  });
});
