import { describe, it, expect } from 'vitest';
import { bucketByDay, bucketsToPoints, countByDay, mergeBuckets, uniqueByDay } from './buckets.js';

// 2023-11-14 00:00:00 UTC = 1699920000
// 2023-11-14 23:59:59 UTC = 1700006399
// 2023-11-15 00:00:00 UTC = 1700006400
const timestamps = new Map([
  [100, 1699920000], // 2023-11-14 00:00:00 UTC
  [200, 1700006399], // 2023-11-14 23:59:59 UTC (one second before midnight)
  [300, 1700006400], // 2023-11-15 00:00:00 UTC
]);

describe('bucketByDay', () => {
  it('sums values per UTC day', () => {
    const result = bucketByDay(
      [
        { blockNumber: 100, value: 1_000_000n },
        { blockNumber: 200, value: 2_000_000n },
        { blockNumber: 300, value: 500_000n },
      ],
      timestamps,
    );
    expect(result.get('2023-11-14')).toBe(3_000_000n);
    expect(result.get('2023-11-15')).toBe(500_000n);
  });

  it('skips items whose block is not in the timestamp map', () => {
    const result = bucketByDay([{ blockNumber: 999, value: 1n }], timestamps);
    expect(result.size).toBe(0);
  });
});

describe('countByDay', () => {
  it('counts items per UTC day', () => {
    const result = countByDay(
      [{ blockNumber: 100 }, { blockNumber: 200 }, { blockNumber: 300 }],
      timestamps,
    );
    expect(result.get('2023-11-14')).toBe(2n);
    expect(result.get('2023-11-15')).toBe(1n);
  });
});

describe('uniqueByDay', () => {
  it('counts distinct keys per UTC day', () => {
    const result = uniqueByDay(
      [
        { blockNumber: 100, key: 'alice' },
        { blockNumber: 200, key: 'alice' }, // duplicate
        { blockNumber: 300, key: 'bob' },
      ],
      timestamps,
    );
    expect(result.get('2023-11-14')).toBe(1n); // alice only
    expect(result.get('2023-11-15')).toBe(1n); // bob only
  });
});

describe('mergeBuckets', () => {
  it('sums across multiple maps', () => {
    const a = new Map([['2023-11-14', 100n]]);
    const b = new Map([['2023-11-14', 50n], ['2023-11-15', 25n]]);
    const result = mergeBuckets(a, b);
    expect(result.get('2023-11-14')).toBe(150n);
    expect(result.get('2023-11-15')).toBe(25n);
  });
});

describe('bucketsToPoints', () => {
  it('fills every date in the range, zeroing missing days', () => {
    const buckets = new Map([['2023-11-15', 42n]]);
    const points = bucketsToPoints(buckets, '2023-11-14', '2023-11-16');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ date: '2023-11-14', value: '0' });
    expect(points[1]).toEqual({ date: '2023-11-15', value: '42' });
    expect(points[2]).toEqual({ date: '2023-11-16', value: '0' });
  });
});
