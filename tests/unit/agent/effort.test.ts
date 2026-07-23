import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EFFORT,
  effortLabel,
  normalizeEffortSelection,
  resolveEffortArg,
  supportedEfforts,
} from '../../../src/agent/effort.js';

describe('Claude effort catalog', () => {
  it('offers every Claude Code effort level after the default sentinel', () => {
    expect(supportedEfforts().map((option) => option.value)).toEqual([
      DEFAULT_EFFORT,
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });

  it('normalizes invalid values to the default', () => {
    expect(normalizeEffortSelection('high')).toBe('high');
    expect(normalizeEffortSelection('invalid')).toBe(DEFAULT_EFFORT);
    expect(normalizeEffortSelection(undefined)).toBe(DEFAULT_EFFORT);
  });

  it('only forwards effort to Claude profiles', () => {
    expect(resolveEffortArg('claude', 'high')).toBe('high');
    expect(resolveEffortArg('claude', DEFAULT_EFFORT)).toBeUndefined();
    expect(resolveEffortArg('codex', 'high')).toBeUndefined();
  });

  it('labels configured values for the saved card', () => {
    expect(effortLabel('high')).toBe('High');
    expect(effortLabel(undefined)).toContain('跟随默认');
  });
});
