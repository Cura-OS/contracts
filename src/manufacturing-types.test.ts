import { describe, expect, test } from 'bun:test';
import {
  assertBomWellFormed,
  parsePositiveQuantity,
  type BillOfMaterials,
  type BomLine,
} from './manufacturing-types';

const line = (over: Partial<BomLine> = {}): BomLine => ({
  component_item_id: 'item-comp-1',
  quantity_per: '2',
  uom: 'ea',
  is_sub_assembly: false,
  operation_sequence: null,
  scrap_pct: null,
  ...over,
});

const bom = (over: Partial<BillOfMaterials> = {}): unknown => ({
  id: 'bom-1',
  tenant_id: 'tenant-1',
  code: 'BOM-A',
  item_id: 'item-parent',
  quantity: '1',
  uom: 'ea',
  routing_id: null,
  version: 1,
  is_active: true,
  lines: [line()],
  ...over,
});

describe('parsePositiveQuantity', () => {
  test('parses a positive decimal string', () => {
    expect(parsePositiveQuantity('2.5')).toBe(2.5);
  });

  // RED WITHOUT FIX: a float on the wire would silently drift; the contract is a
  // STRING that must parse positive. Empty / zero / negative / non-numeric fail.
  test.each(['', '   ', '0', '-1', 'abc', 'NaN'])('rejects %p', (bad) => {
    expect(() => parsePositiveQuantity(bad)).toThrow();
  });

  test('rejects a non-string (a raw number is a wire drift)', () => {
    expect(() => parsePositiveQuantity(2 as unknown)).toThrow(TypeError);
  });
});

describe('assertBomWellFormed', () => {
  test('accepts a single-level BOM', () => {
    expect(() => assertBomWellFormed(bom())).not.toThrow();
  });

  test('accepts a multi-level BOM (sub-assembly line)', () => {
    expect(() =>
      assertBomWellFormed(bom({ lines: [line({ is_sub_assembly: true })] })),
    ).not.toThrow();
  });

  test('rejects an empty BOM (produces nothing)', () => {
    expect(() => assertBomWellFormed(bom({ lines: [] }))).toThrow(/at least one component/);
  });

  // The infinite-explosion guard: a line consuming the parent item itself.
  test('rejects a direct self-reference', () => {
    expect(() =>
      assertBomWellFormed(bom({ lines: [line({ component_item_id: 'item-parent' })] })),
    ).toThrow(/self-reference/);
  });

  test('rejects a duplicate component line (ambiguous net requirement)', () => {
    expect(() =>
      assertBomWellFormed(bom({ lines: [line(), line()] })),
    ).toThrow(/duplicate component/);
  });

  test('rejects a non-positive quantity_per', () => {
    expect(() =>
      assertBomWellFormed(bom({ lines: [line({ quantity_per: '0' })] })),
    ).toThrow();
  });

  test('rejects a non-object', () => {
    expect(() => assertBomWellFormed(null)).toThrow(TypeError);
  });
});
