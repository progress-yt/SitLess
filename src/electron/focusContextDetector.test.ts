import { describe, expect, it } from 'vitest';
import { getFocusPollDelay, parseFocusContext } from './focusContextDetector';

describe('focus context parsing', () => {
  it('prioritizes known meeting applications', () => {
    expect(parseFocusContext('{"processName":"Teams","windowTitle":"Weekly meeting","fullscreen":true}')).toEqual({
      active: true,
      reason: 'meeting-app',
      appName: 'Teams'
    });
  });

  it('does not treat an idle collaboration window as an active meeting', () => {
    expect(parseFocusContext('{"processName":"Teams","windowTitle":"Chat","fullscreen":false}').active).toBe(false);
  });

  it('detects fullscreen applications and ignores the desktop shell', () => {
    expect(parseFocusContext('{"processName":"PowerPoint","fullscreen":true}').reason).toBe('fullscreen-app');
    expect(parseFocusContext('{"processName":"explorer","fullscreen":true}').active).toBe(false);
  });

  it('fails closed for malformed command output', () => {
    expect(parseFocusContext('not-json')).toEqual({ active: false, reason: null, appName: null });
  });
});

describe('focus context polling', () => {
  it('backs off after failures and caps the delay', () => {
    expect([0, 1, 2, 3, 4].map(getFocusPollDelay)).toEqual([5000, 10000, 20000, 40000, 60000]);
  });
});
