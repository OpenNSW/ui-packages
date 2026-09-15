import { describe, expect, it } from 'vitest'
import { evaluateExpressions, shapeSheet, type CellValue } from './spreadsheet'
import { recordsToMatrix, transpose, type DataRecord } from './records'

describe('recordsToMatrix', () => {
  it('puts the field names in row 0 and one record per row after it', () => {
    const records: DataRecord[] = [
      { Item: 'Widget A', Quantity: 500 },
      { Item: 'Widget B', Quantity: 300 },
    ]
    expect(recordsToMatrix(records)).toEqual([
      ['Item', 'Quantity'],
      ['Widget A', 500],
      ['Widget B', 300],
    ])
  })

  it('builds the header from the union of every record’s keys, not just the first', () => {
    const records: DataRecord[] = [{ Item: 'A' }, { Item: 'B', Note: 'late' }]
    expect(recordsToMatrix(records)).toEqual([
      ['Item', 'Note'],
      ['A', null],
      ['B', 'late'],
    ])
  })

  it('keeps a reordered record aligned to the header', () => {
    // Rows are built by looking up header keys — iterating the record instead
    // would swap this record's columns.
    const records: DataRecord[] = [
      { Item: 'A', Quantity: 10 },
      { Quantity: 20, Item: 'B' },
    ]
    expect(recordsToMatrix(records)).toEqual([
      ['Item', 'Quantity'],
      ['A', 10],
      ['B', 20],
    ])
  })

  it('pads a short record out to the header width', () => {
    const records: DataRecord[] = [{ A: 1, B: 2, C: 3 }, { A: 4 }]
    expect(recordsToMatrix(records)).toEqual([
      ['A', 'B', 'C'],
      [1, 2, 3],
      [4, null, null],
    ])
  })

  it('preserves a Date, which a spreadsheet-sourced record can legitimately hold', () => {
    // The XML-only ancestor of this function blanked Dates, correctly, because
    // fast-xml-parser never produces one. A records array from an uploaded
    // sheet can, and blanking it would silently break a date formula.
    const date = new Date(2026, 5, 1)
    expect(recordsToMatrix([{ When: date }])).toEqual([['When'], [date]])
  })

  it('returns an empty matrix for no records, or records with no fields', () => {
    expect(recordsToMatrix([])).toEqual([])
    expect(recordsToMatrix([{}, {}])).toEqual([])
  })

  describe('columns', () => {
    it('pins header order to the given key list instead of first-seen order', () => {
      const records: DataRecord[] = [{ Quantity: 500, Item: 'Widget A' }]
      expect(recordsToMatrix(records, ['Item', 'Quantity'])).toEqual([
        ['Item', 'Quantity'],
        ['Widget A', 500],
      ])
    })

    it('still appends a record key absent from columns, in first-seen order', () => {
      const records: DataRecord[] = [{ Item: 'A', Quantity: 10, Note: 'late' }]
      expect(recordsToMatrix(records, ['Quantity', 'Item'])).toEqual([
        ['Quantity', 'Item', 'Note'],
        [10, 'A', 'late'],
      ])
    })

    it('gives a listed key its own all-null column even if no record has it', () => {
      const records: DataRecord[] = [{ Item: 'A' }]
      expect(recordsToMatrix(records, ['Item', 'Quantity'])).toEqual([
        ['Item', 'Quantity'],
        ['A', null],
      ])
    })

    it('pins column letters an x-evaluate formula addresses, regardless of per-record key order', async () => {
      // The scenario this exists for: rows written by an XML importer, whose
      // element order can vary row to row, but whose consuming formula still
      // has to find quantity in a fixed column.
      const records: DataRecord[] = [
        { Item: 'A', Quantity: 10 },
        { Quantity: 25, Item: 'B' },
      ]
      const matrix = recordsToMatrix(records, ['Item', 'Quantity'])
      const [result] = await evaluateExpressions(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(B2:B3)' }])
      expect(result.value).toBe(35)
    })
  })

  it('does not read an inherited property for a header key named after one', () => {
    const records: DataRecord[] = [{ Item: 'A' }, { toString: 'shadowed' }]
    expect(recordsToMatrix(records)).toEqual([
      ['Item', 'toString'],
      ['A', null],
      [null, 'shadowed'],
    ])
  })

  describe('non-scalar fields', () => {
    // These assert the FORMULA RESULT, not just the matrix cell, because the
    // result is the thing that would be silently wrong. Both numbers below were
    // verified against the real fast-formula-parser.

    it('blanks a nested object, so a total is not silently short', async () => {
      const records: DataRecord[] = [
        { Item: 'A', Quantity: 10 },
        { Item: 'B', Quantity: { deep: { a: 1 } } },
        { Item: 'C', Quantity: 25 },
      ]
      const matrix = recordsToMatrix(records)
      expect(matrix[2]).toEqual(['B', null])
      const [result] = await evaluateExpressions(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(B2:B4)' }])
      expect(result).toEqual({ id: 'total', label: 'Total', value: 35 })
    })

    it('blanks a nested array, so its own values are not pooled into a total', async () => {
      // The worst case and the reason blanking is not optional: left raw, a
      // range containing [1, 2] pools those numbers in, so 10 + [1,2] + 25 sums
      // to 38 rather than the value being ignored. A repeated child inside a
      // record is ordinary in XML, so this is a realistic corruption.
      const records: DataRecord[] = [
        { Item: 'A', Quantity: 10 },
        { Item: 'B', Quantity: [1, 2] },
        { Item: 'C', Quantity: 25 },
      ]
      const [result] = await evaluateExpressions(recordsToMatrix(records), [
        { id: 'total', label: 'Total', expression: '=SUM(B2:B4)' },
      ])
      expect(result.value).toBe(35)
      expect(result.value).not.toBe(38)
    })

    it('keeps the column when blanking, so later column letters do not shift', async () => {
      const records: DataRecord[] = [
        { Item: 'A', Meta: { src: 'x' }, Quantity: 10 },
        { Item: 'B', Meta: { src: 'y' }, Quantity: 25 },
      ]
      const matrix = recordsToMatrix(records)
      expect(matrix[0]).toEqual(['Item', 'Meta', 'Quantity'])
      const [result] = await evaluateExpressions(matrix, [{ id: 'total', label: 'Total', expression: '=SUM(C2:C3)' }])
      expect(result.value).toBe(35)
    })

    it('pads short records so a range over a partly-missing column is not under-counted', async () => {
      const records: DataRecord[] = [{ Item: 'A', Bonus: 5 }, { Item: 'B' }, { Item: 'C', Bonus: 7 }]
      const [result] = await evaluateExpressions(recordsToMatrix(records), [
        { id: 'total', label: 'Total', expression: '=SUM(B2:B4)' },
      ])
      expect(result.value).toBe(12)
    })
  })
})

describe('transpose', () => {
  it('swaps rows and columns', () => {
    expect(
      transpose([
        ['Metric', 'Q1', 'Q2'],
        ['Units', 100, 150],
      ]),
    ).toEqual([
      ['Metric', 'Units'],
      ['Q1', 100],
      ['Q2', 150],
    ])
  })

  it('pads a short row with null so the result is rectangular', () => {
    expect(transpose([['a', 'b', 'c'], ['d']])).toEqual([
      ['a', 'd'],
      ['b', null],
      ['c', null],
    ])
  })

  it('is its own inverse for a rectangular matrix', () => {
    const matrix = [
      ['Metric', 'Q1', 'Q2'],
      ['Units', 100, 150],
      ['Revenue', 40, 55],
    ]
    expect(transpose(transpose(matrix))).toEqual(matrix)
  })

  it('round-trips a rowHeader sheet back to the matrix it was shaped from', () => {
    // The reason this exists: shapeSheet's rowHeader branch builds one record
    // per original COLUMN, so reading that back needs the quarter turn or the
    // labels come out along row 1 instead of down column A.
    const original = [
      ['Metric', 'Q1', 'Q2'],
      ['Units', 100, 150],
      ['Revenue', 40, 55],
    ]
    const asRecords = shapeSheet(original, { rowHeader: true }) as Record<string, CellValue>[]
    expect(transpose(recordsToMatrix(asRecords))).toEqual(original)
  })

  it('returns an empty matrix for no rows', () => {
    expect(transpose([])).toEqual([])
  })
})
