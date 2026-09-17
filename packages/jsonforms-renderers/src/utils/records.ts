import type { CellValue } from './spreadsheet/types'

// Turning tabular data into something the formula engine can address.
//
// A sheet reaches SpreadsheetControl in one of two shapes — a 2-D array, which
// the engine addresses literally, and an array of objects, which is flattened
// here into a header row plus one row per record. Records arrive both from a
// columnHeader/rowHeader upload read back out of storage and from an importer
// writing rows straight into the field, so this is what lets one A1 reference
// mean the same cell either way.

/** One record — arbitrary form data, so its values are unknown until checked. */
export type DataRecord = Record<string, unknown>

// Date is included where the XML-only ancestor of this file excluded it:
// fast-xml-parser never produces one, but a records array that came from a
// spreadsheet upload legitimately can, and blanking those would silently break
// any date formula written against them.
function isScalar(value: unknown): value is CellValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  )
}

// Records in, engine-ready matrix out: field names at row 0, one record per row
// after it. That is the layout an x-spreadsheet.columnHeader sheet already has,
// which is what lets one A1 reference mean the same thing against either.
//
// Three rules, each forced by verified formula-engine behaviour rather than by
// any particular source format. makeOnRange (utils/spreadsheet/expression.ts)
// hands cell values to the formula functions through only a blank check, so
// whatever lands in a cell is what SUM sees:
//
//  1. The header is the union of EVERY record's keys, in first-seen order — not
//     just the first record's. Neither a fixed key set nor a fixed key order is
//     guaranteed across records. `columns`, when given, seeds the header before
//     that scan, so a caller with a declared field order (SpreadsheetControl's
//     x-spreadsheet.columns/rows) can pin those positions to specific keys
//     instead of trusting whatever order the records array happens to arrive
//     in — this is what re-normalizes a records array whose own key order
//     isn't guaranteed to survive a storage round trip (e.g. Postgres JSONB,
//     which does not preserve object key insertion order) back to the
//     declared order, by matching key NAME, regardless of each record's own
//     insertion order. A listed key not present in any record still claims
//     its column, all null; any record key not listed still falls in
//     afterwards, in first-seen order, exactly as without `columns`.
//  2. Every row is built by looking up the header keys, never by iterating the
//     record, and a missing key becomes null. That keeps a REORDERED record
//     aligned, and pads a SHORT record to the header's width — without the
//     padding, a range over a partly-missing column silently under-counts
//     (verified: SUM over a column absent from the last row returns 0, not an
//     error).
//  3. A NON-SCALAR value becomes null. The column is kept, because dropping it
//     would shift every later column's letter and make A1 references
//     unpredictable — but the value must not survive. Verified against the real
//     library: a nested object makes SUM skip it and return a confident wrong
//     total, and a nested array is worse, pooling its own numbers into the
//     aggregate (a column of 10 / [1,2] / 25 sums to 38). Blanking is the only
//     shape that cannot silently corrupt a total; the real value is still in the
//     source field, since this matrix is a derived view for formulas alone.
export function recordsToMatrix(records: DataRecord[], columns?: string[]): CellValue[][] {
  if (records.length === 0) return []

  const header: string[] = []
  const seen = new Set<string>()
  for (const key of columns ?? []) {
    if (seen.has(key)) continue
    seen.add(key)
    header.push(key)
  }
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (seen.has(key)) continue
      seen.add(key)
      header.push(key)
    }
  }
  if (header.length === 0) return []

  const rows = records.map((record) =>
    header.map((key) => {
      // Own-property lookup: these are plain objects, so a header key of
      // "constructor" or "toString" would otherwise read off the prototype.
      if (!Object.prototype.hasOwnProperty.call(record, key)) return null
      const value = record[key]
      return isScalar(value) ? value : null
    }),
  )

  return [header, ...rows]
}

// Swaps rows and columns, padding short rows with null so the result is
// rectangular.
//
// recordsToMatrix always puts the keys in ROW 0, which is the layout
// x-spreadsheet.columnHeader describes. rowHeader describes the other
// orientation — keys down COLUMN A — so a records array being rendered or
// addressed under rowHeader has to be turned a quarter turn first.
//
// That makes the two shapes round-trip. shapeSheet's columnsToRecords builds
// one record per original COLUMN, keyed by column A; feeding those back through
// recordsToMatrix and then transposing reproduces the matrix they came from,
// which is what lets a reloaded rowHeader sheet render exactly as the uploaded
// one did.
export function transpose(matrix: CellValue[][]): CellValue[][] {
  const width = Math.max(0, ...matrix.map((row) => row.length))
  return Array.from({ length: width }, (_, col) => matrix.map((row) => row[col] ?? null))
}
