import type { CellValue } from './spreadsheet/types'

// Turning arbitrary tabular data found in form data into something the formula
// engine can address. Used when SpreadsheetControl reads from a path, where the rows
// come from another field's value rather than from an uploaded file — an XML
// document's repeated element, an array control's items, another sheet.
//
// Two shapes are accepted, the same two a persisted `sheet` can already take
// (see SheetData / isRecordsSheet in utils/spreadsheet): a 2-D array, which the
// engine addresses literally, and an array of objects, which is flattened here
// into a header row plus one row per record.

/** One record — arbitrary form data, so its values are unknown until checked. */
export type DataRecord = Record<string, unknown>

export type SheetSource =
  /** Nothing at the path yet — typically an upstream field not filled in. */
  | { status: 'missing' }
  /** Something is there, but it is not rows: a scalar, or an array of neither. */
  | { status: 'invalid' }
  /** A 2-D array. Addressed literally: A1 is the first cell of the first row. */
  | { status: 'matrix'; matrix: CellValue[][] }
  /** Objects. Flattened by recordsToMatrix, so row 1 is the field names. */
  | { status: 'records'; records: DataRecord[] }

function isRecord(value: unknown): value is DataRecord {
  return value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

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

// Classifies whatever a source path resolved to. Never throws — every outcome is
// a status the caller renders, because a path pointing at a field the user has
// not filled in yet is the normal case, not an error.
//
// Matrix vs records is told apart by whether the first entry is itself an array,
// the same read-time test isRecordsSheet already uses for a persisted sheet
// rather than a stored discriminant.
export function selectSheetSource(value: unknown): SheetSource {
  if (value == null) return { status: 'missing' }

  // A lone object counts as one record. Same safety net as elsewhere in this
  // codebase: a container holding exactly one child often parses as an object
  // rather than a one-element array, and without this a single-row source would
  // silently evaluate as no rows at all.
  if (isRecord(value)) return { status: 'records', records: [value] }

  if (!Array.isArray(value)) return { status: 'invalid' }
  if (value.length === 0) return { status: 'records', records: [] }

  if (Array.isArray(value[0])) {
    // Rows of a 2-D array are passed through untouched: the engine addresses
    // them literally, exactly as it does an uploaded sheet's matrix.
    return { status: 'matrix', matrix: value as CellValue[][] }
  }

  const records = value.filter(isRecord)
  // A non-empty array that yields no records is a real configuration mistake —
  // a list of strings, say — and reporting "no rows" would hide it.
  return records.length > 0 ? { status: 'records', records } : { status: 'invalid' }
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
//     guaranteed across records.
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
export function recordsToMatrix(records: DataRecord[]): CellValue[][] {
  if (records.length === 0) return []

  const header: string[] = []
  const seen = new Set<string>()
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
