import { describe, expect, it } from 'vitest'
import { isRecordsSheet, shapeSheet, validateSpreadsheetConfig } from './process'
import type { CellValue, SpreadsheetFieldSpec } from './types'

const ITEM_QTY: SpreadsheetFieldSpec[] = [
  { id: 'Item', label: 'Item' },
  { id: 'Qty', label: 'Qty' },
]

const METRIC_REVENUE_COST: SpreadsheetFieldSpec[] = [
  { id: 'Revenue', label: 'Revenue' },
  { id: 'Cost', label: 'Cost' },
]

describe('shapeSheet', () => {
  it('returns the matrix unchanged when neither flag is set', () => {
    const matrix: CellValue[][] = [
      ['Item', 'Qty'],
      ['Widget', 10],
    ]
    expect(shapeSheet(matrix)).toBe(matrix)
  })

  it('throws with the validator message, x-spreadsheet-prefixed, for any invalid config', () => {
    expect(() => shapeSheet([], { columnHeader: true })).toThrow(
      'x-spreadsheet: columnHeader is true but columns is missing or empty — declare the column list columnHeader positions map to.',
    )
  })

  it('throws when both columnHeader and rowHeader are true, rather than picking a winner', () => {
    const matrix: CellValue[][] = [
      ['A', 'B'],
      ['1', '2'],
    ]
    expect(() =>
      shapeSheet(matrix, { columnHeader: true, rowHeader: true, columns: ITEM_QTY, rows: METRIC_REVENUE_COST }),
    ).toThrow(/columnHeader and rowHeader cannot both be true/)
  })

  describe('columnHeader (positional, via columns)', () => {
    it('discards row 0 content entirely, regardless of what is in it — keys always come from declared columns', () => {
      const matrix: CellValue[][] = [
        ['garbage', 'also garbage'],
        ['Widget', 10],
        ['Gadget', 20],
      ]
      expect(shapeSheet(matrix, { columnHeader: true, columns: ITEM_QTY })).toEqual([
        { Item: 'Widget', Qty: 10 },
        { Item: 'Gadget', Qty: 20 },
      ])
    })

    it('treats row 0 as real data when columnHeader is false/absent (headerless mode)', () => {
      const matrix: CellValue[][] = [
        ['Widget', 10],
        ['Gadget', 20],
      ]
      expect(shapeSheet(matrix, { columns: ITEM_QTY })).toEqual([
        { Item: 'Widget', Qty: 10 },
        { Item: 'Gadget', Qty: 20 },
      ])
    })

    it('yields an empty array for a header-only sheet (no data rows)', () => {
      expect(shapeSheet([['x', 'y']], { columnHeader: true, columns: ITEM_QTY })).toEqual([])
    })

    it('yields an empty array for an empty matrix', () => {
      expect(shapeSheet([], { columnHeader: true, columns: ITEM_QTY })).toEqual([])
    })

    it('fills a ragged row shorter than declared columns with null for its missing fields', () => {
      const matrix: CellValue[][] = [
        ['x', 'y', 'z'],
        ['A', 'B'],
      ]
      const columns: SpreadsheetFieldSpec[] = [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
        { id: 'C', label: 'C' },
      ]
      expect(shapeSheet(matrix, { columnHeader: true, columns })).toEqual([{ A: 'A', B: 'B', C: null }])
    })

    it('drops a data row longer than declared columns instead of keeping its undeclared cells', () => {
      const matrix: CellValue[][] = [
        ['x', 'y'],
        ['A', 'B', 'C'],
      ]
      const columns: SpreadsheetFieldSpec[] = [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
      ]
      expect(shapeSheet(matrix, { columnHeader: true, columns })).toEqual([{ A: 'A', B: 'B' }])
    })

    it('a declared column id of "__proto__" is a real, enumerable own key, not a prototype override', () => {
      const matrix: CellValue[][] = [
        ['x', 'y'],
        ['A', 'B'],
      ]
      const columns: SpreadsheetFieldSpec[] = [
        { id: '__proto__', label: 'Proto' },
        { id: 'B', label: 'B' },
      ]
      const [record] = shapeSheet(matrix, { columnHeader: true, columns }) as Record<string, CellValue>[]
      expect(Object.prototype.hasOwnProperty.call(record, '__proto__')).toBe(true)
      expect(Object.keys(record)).toEqual(['__proto__', 'B'])
      expect(JSON.parse(JSON.stringify(record))).toEqual({ ['__proto__']: 'A', B: 'B' })
    })
  })

  describe('rowHeader (positional, via rows)', () => {
    it('discards column 0 content entirely, then turns each OTHER column into one record keyed by declared rows, transposed', () => {
      // Each MATRIX ROW is one declared field's data, across all other
      // columns — there's no separate "header ROW" to skip here (that's
      // columnHeader's concept); rowHeader/rows skip a COLUMN (column 0 of
      // every row), which is what the garbage labels below exercise.
      const matrix: CellValue[][] = [
        ['garbage1', 100, 120],
        ['garbage2', 40, 55],
      ]
      expect(shapeSheet(matrix, { rowHeader: true, rows: METRIC_REVENUE_COST })).toEqual([
        { Revenue: 100, Cost: 40 },
        { Revenue: 120, Cost: 55 },
      ])
    })

    it('treats column 0 as real data when rowHeader is false/absent (headerless mode)', () => {
      const matrix: CellValue[][] = [
        [100, 120],
        [40, 55],
      ]
      expect(shapeSheet(matrix, { rows: METRIC_REVENUE_COST })).toEqual([
        { Revenue: 100, Cost: 40 },
        { Revenue: 120, Cost: 55 },
      ])
    })

    it('yields an empty array when there is only a column A and no other columns', () => {
      expect(shapeSheet([['x'], ['y']], { rowHeader: true, rows: METRIC_REVENUE_COST })).toEqual([])
    })

    it('yields an empty array for an empty matrix', () => {
      expect(shapeSheet([], { rowHeader: true, rows: METRIC_REVENUE_COST })).toEqual([])
    })

    it('fills a short row with null for the missing column', () => {
      // Cost's row is one cell shorter than Revenue's, so the second
      // (Q2) record's Cost is missing entirely, not just blank.
      const matrix: CellValue[][] = [
        ['x', 100, 120],
        ['y', 40],
      ]
      expect(shapeSheet(matrix, { rowHeader: true, rows: METRIC_REVENUE_COST })).toEqual([
        { Revenue: 100, Cost: 40 },
        { Revenue: 120, Cost: null },
      ])
    })

    it('a declared row id of "__proto__" is a real, enumerable own key, not a prototype override', () => {
      const matrix: CellValue[][] = [['x', 100]]
      const rows: SpreadsheetFieldSpec[] = [{ id: '__proto__', label: 'Proto' }]
      const [record] = shapeSheet(matrix, { rowHeader: true, rows }) as Record<string, CellValue>[]
      expect(Object.prototype.hasOwnProperty.call(record, '__proto__')).toBe(true)
      expect(JSON.parse(JSON.stringify(record))).toEqual({ ['__proto__']: 100 })
    })
  })
})

describe('validateSpreadsheetConfig', () => {
  it('accepts no config at all — raw matrix passthrough', () => {
    expect(validateSpreadsheetConfig({})).toBeNull()
  })

  it('accepts columnHeader with columns declared', () => {
    expect(validateSpreadsheetConfig({ columnHeader: true, columns: ITEM_QTY })).toBeNull()
  })

  it('accepts columns declared without columnHeader (headerless mode)', () => {
    expect(validateSpreadsheetConfig({ columns: ITEM_QTY })).toBeNull()
  })

  it('accepts rowHeader with rows declared, and rows declared without rowHeader', () => {
    expect(validateSpreadsheetConfig({ rowHeader: true, rows: METRIC_REVENUE_COST })).toBeNull()
    expect(validateSpreadsheetConfig({ rows: METRIC_REVENUE_COST })).toBeNull()
  })

  it('rejects columnHeader: true with columns missing', () => {
    expect(validateSpreadsheetConfig({ columnHeader: true })).toMatch(/columns is missing or empty/)
  })

  it('rejects columnHeader: true with columns: []', () => {
    expect(validateSpreadsheetConfig({ columnHeader: true, columns: [] })).toMatch(/columns is missing or empty/)
  })

  it('rejects rowHeader: true with rows missing', () => {
    expect(validateSpreadsheetConfig({ rowHeader: true })).toMatch(/rows is missing or empty/)
  })

  it('rejects rowHeader: true with rows: []', () => {
    expect(validateSpreadsheetConfig({ rowHeader: true, rows: [] })).toMatch(/rows is missing or empty/)
  })

  it('rejects columnHeader and rowHeader both true', () => {
    expect(
      validateSpreadsheetConfig({ columnHeader: true, rowHeader: true, columns: ITEM_QTY, rows: METRIC_REVENUE_COST }),
    ).toMatch(/cannot both be true/)
  })

  it('rejects columns and rows both declared', () => {
    expect(validateSpreadsheetConfig({ columns: ITEM_QTY, rows: METRIC_REVENUE_COST })).toMatch(
      /cannot both be declared/,
    )
  })

  it('rejects a duplicate id within columns instead of silently colliding', () => {
    const columns: SpreadsheetFieldSpec[] = [
      { id: 'A', label: 'A' },
      { id: 'A', label: 'A again' },
    ]
    expect(validateSpreadsheetConfig({ columnHeader: true, columns })).toMatch(/duplicate column id "A"/)
  })

  it('rejects a duplicate id within rows instead of silently colliding', () => {
    const rows: SpreadsheetFieldSpec[] = [
      { id: 'A', label: 'A' },
      { id: 'A', label: 'A again' },
    ]
    expect(validateSpreadsheetConfig({ rowHeader: true, rows })).toMatch(/duplicate row id "A"/)
  })

  // Directly regression-tests a PR review nit: a schema author's `columns:
  // "Qty"` (a plain string, not an array) must surface as this same
  // config-error message, never as a thrown exception from something
  // iterating it as an array of characters ("Q", "t", "y").
  it('rejects columns given as a plain string instead of an array', () => {
    expect(
      validateSpreadsheetConfig({ columnHeader: true, columns: 'Qty' as unknown as SpreadsheetFieldSpec[] }),
    ).toMatch(/columns must be an array/)
  })

  it('rejects rows given as a plain string instead of an array', () => {
    expect(validateSpreadsheetConfig({ rowHeader: true, rows: 'Qty' as unknown as SpreadsheetFieldSpec[] })).toMatch(
      /rows must be an array/,
    )
  })

  it('rejects a columns entry missing id or label', () => {
    expect(
      validateSpreadsheetConfig({
        columnHeader: true,
        columns: [{ id: 'A', label: 'A' }, { label: 'Missing id' } as unknown as SpreadsheetFieldSpec],
      }),
    ).toMatch(/columns\[1\] must be a \{ id, label \} object/)
  })

  it('rejects a rows entry missing id or label', () => {
    expect(
      validateSpreadsheetConfig({
        rowHeader: true,
        rows: [{ id: 'A' } as unknown as SpreadsheetFieldSpec],
      }),
    ).toMatch(/rows\[0\] must be a \{ id, label \} object/)
  })
})

describe('isRecordsSheet', () => {
  it('is false for a matrix', () => {
    expect(
      isRecordsSheet([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe(false)
  })

  it('is true for records', () => {
    expect(isRecordsSheet([{ a: 1 }, { a: 2 }])).toBe(true)
  })

  it('is true for an empty sheet (documented, unavoidable tie-break)', () => {
    expect(isRecordsSheet([])).toBe(true)
  })
})
