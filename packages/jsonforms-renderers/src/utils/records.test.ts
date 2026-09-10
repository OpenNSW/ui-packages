import { describe, expect, it } from 'vitest'
import { evaluateExpressions } from './spreadsheet'
import { recordsToMatrix, selectSheetSource, type DataRecord } from './records'

describe('selectSheetSource', () => {
  it('reports nothing at the path as missing', () => {
    expect(selectSheetSource(undefined)).toEqual({ status: 'missing' })
    expect(selectSheetSource(null)).toEqual({ status: 'missing' })
  })

  it('reports a 2-D array as a matrix, passed through untouched', () => {
    const matrix = [
      ['Item', 'Qty'],
      ['A', 10],
    ]
    expect(selectSheetSource(matrix)).toEqual({ status: 'matrix', matrix })
  })

  it('reports an array of objects as records', () => {
    const records = [{ Item: 'A' }, { Item: 'B' }]
    expect(selectSheetSource(records)).toEqual({ status: 'records', records })
  })

  it('wraps a lone object as one record', () => {
    // A container holding exactly one child often parses as an object rather
    // than a one-element array; without this a single-row source would evaluate
    // as no rows at all.
    expect(selectSheetSource({ Item: 'A' })).toEqual({ status: 'records', records: [{ Item: 'A' }] })
  })

  it('reports an empty array as zero records rather than invalid', () => {
    expect(selectSheetSource([])).toEqual({ status: 'records', records: [] })
  })

  it('reports a scalar as invalid', () => {
    expect(selectSheetSource(5)).toEqual({ status: 'invalid' })
    expect(selectSheetSource('rows')).toEqual({ status: 'invalid' })
    expect(selectSheetSource(true)).toEqual({ status: 'invalid' })
  })

  it('reports a non-empty array yielding no records as invalid, not as no rows', () => {
    // A list of strings is a real configuration mistake; reporting "no rows"
    // would hide it behind an empty table.
    expect(selectSheetSource(['a', 'b'])).toEqual({ status: 'invalid' })
    expect(selectSheetSource([null, null])).toEqual({ status: 'invalid' })
  })

  it('keeps the usable records in a mixed array', () => {
    expect(selectSheetSource([{ Item: 'A' }, 7])).toEqual({ status: 'records', records: [{ Item: 'A' }] })
  })

  it('does not mistake a Date for a record', () => {
    expect(selectSheetSource(new Date(2026, 0, 1))).toEqual({ status: 'invalid' })
  })
})

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
