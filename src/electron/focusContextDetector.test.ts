import { describe, expect, it } from 'vitest';
import { parseFocusContext } from './focusContextDetector';

describe('focus context parsing', () => {
  it('prioritizes known meeting applications', () => {
    expect(parseFocusContext('{"processName":"Teams","fullscreen":true}')).toEqual({
      active: true,
      reason: 'meeting-app',
      appName: 'Teams'
    });
  });

  it('detects fullscreen applications and ignores the desktop shell', () => {
    expect(parseFocusContext('{"processName":"PowerPoint","fullscreen":true}').reason).toBe('fullscreen-app');
    expect(parseFocusContext('{"processName":"explorer","fullscreen":true}').active).toBe(false);
  });

  it('fails closed for malformed command output', () => {
    expect(parseFocusContext('not-json')).toEqual({ active: false, reason: null, appName: null });
  });
});
