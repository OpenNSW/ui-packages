import { evaluateExpressions } from './expression'
import type { CellValue, DerivationResult, FormulaConfigEntry, SheetData, SpreadsheetValue } from './types'

export interface ShapeSheetOptions {
  columnHeader?: boolean
  rowHeader?: boolean
}

export interface ProcessMatrixOptions extends ShapeSheetOptions {
  persistSheet?: boolean
}

// Shapes a raw matrix into what gets persisted as `sheet`. Never touches
// formula evaluation — only ever called when building the PERSISTED value,
// after derivations are already computed against the original, unshaped
// matrix. Both flags true is a schema-authoring error, not a "pick a
// winner" situation — each orientation is independently meaningful in real
// usage, so silently guessing would silently discard the other.
//
// Same format-agnostic contract as processMatrix below (see its own
// comment): this operates purely on the normalized CellValue[][] matrix,
// never on the original file format. A future XML (or any other) upload
// path only needs to produce that same matrix shape — with, if it wants
// records-shaping, a real header row/column at position 0 in it, the same
// convention columnHeader/rowHeader already use for the preview table
// today — and this function works on it completely unchanged. Not adding
// any further pluggability (e.g. an injectable key-extraction strategy)
// ahead of that actually existing: the one real assumption here (keys come
// from row/column 0 of the matrix) is already the existing convention, not
// a new one, and speculatively generalizing further for a format that
// doesn't exist yet isn't worth it until its actual needs are known.
export function shapeSheet(matrix: CellValue[][], options: ShapeSheetOptions = {}): SheetData {
  if (options.columnHeader && options.rowHeader) {
    throw new Error(
      'x-spreadsheet: columnHeader and rowHeader cannot both be true — pick one orientation for the persisted sheet shape.',
    )
  }
  if (options.columnHeader) return rowsToRecords(matrix)
  if (options.rowHeader) return columnsToRecords(matrix)
  return matrix
}

// columnHeader: row 1 = keys, every row after it = one record. A blank/null
// header cell contributes no key (that column is absent from every record,
// not present under a stringified "null"/""). A data row shorter than the
// header fills missing trailing values with null; a row longer than the
// header silently drops its unheaded trailing cells. A duplicate header
// value collides last-write-wins (mirrors the existing duplicate x-evaluate
// id precedent in processMatrix below). Keys use plain String(), not the
// display-oriented formatCell (SpreadsheetControl.tsx) — formatCell's Date
// handling is locale-dependent, which would make persisted KEYS vary by the
// uploading browser's locale; only display formatting may be locale-aware.
function rowsToRecords(matrix: CellValue[][]): Record<string, CellValue>[] {
  const [headerRow, ...bodyRows] = matrix
  if (!headerRow) return []
  const keys = headerRow.map((cell) => (cell == null || cell === '' ? null : String(cell)))
  return bodyRows.map((row) => {
    const record: Record<string, CellValue> = {}
    keys.forEach((key, i) => {
      if (key == null) return
      record[key] = row[i] ?? null
    })
    return record
  })
}

// rowHeader: column A = keys (on every row), every OTHER column = one
// record, transposed. Column A is fully consumed as the key source,
// symmetric with how row 1 is fully consumed above. Same blank/duplicate
// handling as rowsToRecords, transposed.
function columnsToRecords(matrix: CellValue[][]): Record<string, CellValue>[] {
  const keys = matrix.map((row) => (row[0] == null || row[0] === '' ? null : String(row[0])))
  const width = Math.max(0, ...matrix.map((row) => row.length))
  const colCount = Math.max(0, width - 1)
  return Array.from({ length: colCount }, (_, i) => {
    const col = i + 1
    const record: Record<string, CellValue> = {}
    keys.forEach((key, r) => {
      if (key == null) return
      record[key] = matrix[r][col] ?? null
    })
    return record
  })
}

// Told apart at read time, not via a stored field: a matrix row is itself
// an array; a record is a plain object. Array.isArray(undefined) is false,
// so an empty persisted sheet ([]) reads as "records" — harmless, since
// SpreadsheetControl renders zero rows for an empty sheet either way.
export function isRecordsSheet(sheet: SheetData): sheet is Record<string, CellValue>[] {
  return !Array.isArray(sheet[0])
}

// Matrix-in, persisted-value-out. Deliberately format-agnostic: doesn't care
// whether the matrix came from an xlsx/csv upload or (in the future) an XML
// one — this is the reusable seam for both.
export async function processMatrix(
  matrix: CellValue[][],
  formulas: FormulaConfigEntry[],
  options: ProcessMatrixOptions = {},
): Promise<SpreadsheetValue> {
  const results = await evaluateExpressions(matrix, formulas)
  // Keyed by id (not an array) — a duplicate/malformed id collides
  // last-write-wins here, where it previously got its own array slot;
  // accepted for simplicity since ids are schema-author-controlled.
  // Object.create(null), not {} — an id of "__proto__" would otherwise set
  // the object's prototype instead of creating an enumerable own property,
  // silently dropping that derivation from Object.keys/entries and from
  // JSON serialization.
  const derivations: Record<string, DerivationResult> = Object.create(null)
  for (const { id, label, value, error } of results) {
    derivations[id] = error === undefined ? { label, value } : { label, value, error }
  }
  if (options.persistSheet === false) return { derivations }
  return { sheet: shapeSheet(matrix, options), derivations }
}
