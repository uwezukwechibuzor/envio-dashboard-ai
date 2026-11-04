import { describe, it, expect } from 'vitest';
import {
  microUsdToDollars,
  formatUsd,
  formatCount,
  formatBlockAge,
  formatDuration,
  pointValueToNumber,
  sumPoints,
} from './format.js';

describe('microUsdToDollars', () => {
  it('converts 1 USD correctly', () => {
    expect(microUsdToDollars('1000000')).toBe(1);
  });
  it('converts $1.23', () => {
    expect(microUsdToDollars('1230000')).toBe(1.23);
  });
  it('handles $1B+', () => {
    // 1B micro-USD = $1000
    expect(microUsdToDollars('1000000000000')).toBe(1_000_000);
  });
});

describe('formatUsd', () => {
  it('formats billions', () => expect(formatUsd(1_200_000_000)).toBe('$1.20B'));
  it('formats millions', () => expect(formatUsd(3_500_000)).toBe('$3.50M'));
  it('formats thousands', () => expect(formatUsd(45_000)).toBe('$45.0K'));
  it('formats small amounts', () => expect(formatUsd(12.5)).toBe('$12.50'));
});

describe('formatCount', () => {
  it('formats billions', () => expect(formatCount(2_000_000_000)).toBe('2.00B'));
  it('formats millions', () => expect(formatCount(1_500_000)).toBe('1.50M'));
  it('formats thousands', () => expect(formatCount(42_000)).toBe('42.0K'));
  it('formats small', () => expect(formatCount(99)).toBe('99'));
});

describe('formatDuration', () => {
  it('shows ms for sub-second', () => expect(formatDuration(500)).toBe('500ms'));
  it('shows seconds', () => expect(formatDuration(2500)).toBe('2.5s'));
});

describe('formatBlockAge', () => {
  it('returns "just now" for < 1 min', () => {
    const ts = Math.floor(Date.now() / 1000) - 30;
    expect(formatBlockAge(ts)).toBe('just now');
  });
  it('returns minutes ago', () => {
    const ts = Math.floor(Date.now() / 1000) - 5 * 60;
    expect(formatBlockAge(ts)).toBe('5 min ago');
  });
});

describe('pointValueToNumber', () => {
  it('converts usd (micro-usd) correctly', () => {
    expect(pointValueToNumber('1000000', 'usd')).toBe(1);
  });
  it('converts count directly', () => {
    expect(pointValueToNumber('12345', 'count')).toBe(12345);
  });
});

describe('sumPoints', () => {
  it('sums an array of points', () => {
    const pts = [{ value: '1000' }, { value: '2000' }, { value: '500' }];
    expect(sumPoints(pts)).toBe(3500n);
  });
  it('returns 0n for empty array', () => {
    expect(sumPoints([])).toBe(0n);
  });
});
