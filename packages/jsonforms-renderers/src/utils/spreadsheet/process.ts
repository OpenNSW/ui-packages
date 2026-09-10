import { evaluateExpressions } from './expression'
import type {
  CellValue,
  DerivationResult,
  FormulaConfigEntry,
  FormulaResult,
  SheetData,
  SpreadsheetValue,
} from './types'

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

// Fixed, timezone-independent stringification for a header/column-A cell.
// String(date)/date.toString() renders in the LOCAL time zone, which would
// make the persisted record's KEYS vary depending on which time zone the
// uploading browser is in; date.toISOString() (fixed, UTC) doesn't. Only
// display formatting (formatCell, SpreadsheetControl.tsx) is allowed to be
// locale-aware — persisted keys must be deterministic.
function cellKey(cell: CellValue): string | null {
  if (cell == null || cell === '') return null
  if (cell instanceof Date) return cell.toISOString()
  return String(cell)
}

// Unlike processMatrix's `derivations` id (schema-author-controlled, so a
// collision is a config mistake it's reasonable to resolve leniently), these
// keys come straight from the uploaded file — a collision there means the
// file itself doesn't actually identify a column/row uniquely, so silently
// picking a winner would silently drop real data. Reject instead.
function assertUniqueKeys(keys: (string | null)[], option: 'columnHeader' | 'rowHeader'): void {
  const seen = new Set<string>()
  for (const key of keys) {
    if (key == null) continue
    if (seen.has(key)) {
      throw new Error(
        `x-spreadsheet: duplicate ${option} value "${key}" — every ${option === 'columnHeader' ? 'column header' : 'column-A value'} must be unique to shape as records.`,
      )
    }
    seen.add(key)
  }
}

// columnHeader: row 1 = keys, every row after it = one record. A blank/null
// header cell contributes no key (that column is absent from every record,
// not present under a stringified "null"/""). A data row shorter than the
// header fills missing trailing values with null; a row longer than the
// header silently drops its unheaded trailing cells. A duplicate header
// value is rejected outright (see assertUniqueKeys above).
function rowsToRecords(matrix: CellValue[][]): Record<string, CellValue>[] {
  const [headerRow, ...bodyRows] = matrix
  if (!headerRow) return []
  const keys = headerRow.map(cellKey)
  assertUniqueKeys(keys, 'columnHeader')
  return bodyRows.map((row) => {
    // Object.create(null), not {} — a header cell of "__proto__" would
    // otherwise set the record's prototype instead of creating an
    // enumerable own property, silently dropping that column from
    // Object.keys/entries and JSON serialization. Same fix already applied
    // to processMatrix's derivations accumulator below (#32) — worse here
    // since these keys come from the uploaded file, not a schema-author-
    // controlled x-evaluate id.
    const record: Record<string, CellValue> = Object.create(null)
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
  const keys = matrix.map((row) => cellKey(row[0]))
  assertUniqueKeys(keys, 'rowHeader')
  const width = Math.max(0, ...matrix.map((row) => row.length))
  const colCount = Math.max(0, width - 1)
  return Array.from({ length: colCount }, (_, i) => {
    const col = i + 1
    const record: Record<string, CellValue> = Object.create(null)
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
  const derivations = buildDerivations(await evaluateExpressions(matrix, formulas))
  if (options.persistSheet === false) return { derivations }
  return { sheet: shapeSheet(matrix, options), derivations }
}

// Folds evaluation results into the persisted map. Shared by processMatrix and
// by SpreadsheetControl's source mode, which builds the same map without any
// sheet to go with it.
//
// Keyed by id (not an array) so a sibling field can address one derivation
// directly via a plain data path, with no "find by id" step. A duplicate or
// malformed id collides last-write-wins — accepted for simplicity, since ids are
// schema-author-controlled. Object.create(null), not {}, because an id of
// "__proto__" would otherwise set the object's prototype instead of creating an
// enumerable own property, silently dropping that derivation from
// Object.keys/entries and from JSON serialization.
export function buildDerivations(results: FormulaResult[]): Record<string, DerivationResult> {
  const derivations: Record<string, DerivationResult> = Object.create(null)
  for (const { id, label, value, error } of results) {
    derivations[id] = error === undefined ? { label, value } : { label, value, error }
  }
  return derivations
}

// Normalizes one derivation value for comparison. A Date has to compare equal to
// the ISO string it round-trips to through JSON storage — otherwise a TODAY()
// formula reports a change on every mount and marks a saved form dirty.
function sameValue(a: CellValue | null | undefined, b: CellValue | null | undefined): boolean {
  const normalize = (v: CellValue | null | undefined) => (v instanceof Date ? v.toISOString() : (v ?? null))
  return normalize(a) === normalize(b)
}

// Structural equality for two derivation maps, deliberately not JSON.stringify:
// key order in a stored map need not match the x-evaluate iteration order that
// produced it, and a Date needs the normalization above.
//
// Used as the write guard in SpreadsheetControl's source mode, where the value
// is an object rebuilt on every evaluation — so a reference check would always
// report a change and dirty the form merely by opening a saved record.
export function sameDerivations(
  a: Record<string, DerivationResult> | undefined,
  b: Record<string, DerivationResult> | undefined,
): boolean {
  const left = a ?? {}
  const right = b ?? {}
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    const x = left[key]
    const y = right[key]
    return x.label === y.label && x.error === y.error && sameValue(x.value, y.value)
  })
}
