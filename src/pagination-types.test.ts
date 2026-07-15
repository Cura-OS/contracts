import { describe, expect, test } from 'bun:test';
import { clampLimit, makePage } from './pagination-types';

describe('clampLimit', () => {
  const o = { def: 25, max: 100 };
  test('undefined -> default', () => {
    expect(clampLimit(undefined, o)).toBe(25);
  });
  test('above max -> max', () => {
    expect(clampLimit(1000, o)).toBe(100);
  });
  test('below 1 -> 1', () => {
    expect(clampLimit(0, o)).toBe(1);
    expect(clampLimit(-5, o)).toBe(1);
  });
  test('in range -> floored value', () => {
    expect(clampLimit(30.9, o)).toBe(30);
  });
  test('NaN -> default', () => {
    expect(clampLimit(NaN, o)).toBe(25);
  });
  test('Infinity -> max', () => {
    expect(clampLimit(Infinity, o)).toBe(100);
  });
});

describe('makePage', () => {
  test('derives count from items, defaults nextCursor null, omits total', () => {
    const p = makePage([1, 2, 3]);
    expect(p.items).toEqual([1, 2, 3]);
    expect(p.meta).toEqual({ nextCursor: null, count: 3 });
    expect('total' in p.meta).toBe(false);
  });
  test('carries nextCursor and total when supplied', () => {
    const p = makePage(['a'], { nextCursor: 'c2', total: 42 });
    expect(p.meta).toEqual({ nextCursor: 'c2', total: 42, count: 1 });
  });
  test('empty page has count 0', () => {
    expect(makePage([]).meta.count).toBe(0);
  });
});
