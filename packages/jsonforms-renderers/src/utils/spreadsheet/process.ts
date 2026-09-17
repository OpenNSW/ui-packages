import type { CellValue, DerivationResult, FormulaResult, SheetData, SpreadsheetFieldSpec } from './types'

export interface ShapeSheetOptions {
  columnHeader?: boolean
  rowHeader?: boolean
  columns?: SpreadsheetFieldSpec[]
  rows?: SpreadsheetFieldSpec[]
}

function firstDuplicateId(fields: SpreadsheetFieldSpec[]): string | null {
  const seen = new Set<string>()
  for (const { id } of fields) {
    if (seen.has(id)) return id
    seen.add(id)
  }
  return null
}

// Single source of truth for whether an x-spreadsheet config is valid,
// shared by shapeSheet's throw and SpreadsheetControl's inline error box —
// so the two can never drift into different wording for the same mistake.
// Checked in an order that catches a malformed SHAPE before anything
// downstream ever iterates it: a schema author's `columns: "Qty"` (a plain
// string, not an array) must surface as this same config-error message, not
// as a thrown exception from something treating it as an array of
// characters.
//
// Returns null when valid, else a message (no "x-spreadsheet:" /
// "Invalid x-spreadsheet config:" prefix — each caller prefixes its own way).
export function validateSpreadsheetConfig(options: ShapeSheetOptions): string | null {
  const { columnHeader, rowHeader, columns, rows } = options

  if (columns !== undefined && !Array.isArray(columns)) {
    return 'columns must be an array of { id, label } objects.'
  }
  if (rows !== undefined && !Array.isArray(rows)) {
    return 'rows must be an array of { id, label } objects.'
  }

  // An explicitly supplied `columns: []`/`rows: []` is rejected outright, in
  // every mode — not just when columnHeader/rowHeader is true. Without this,
  // it reads identically to omitting the field entirely (both give
  // hasColumns/hasRows false below), so shapeSheet would silently fall back
  // to raw matrix persistence instead of the records shape the schema author
  // was clearly trying to declare.
  if (columns !== undefined && columns.length === 0) {
    return 'columns is declared but empty — declare at least one field, or omit it entirely for raw matrix mode.'
  }
  if (rows !== undefined && rows.length === 0) {
    return 'rows is declared but empty — declare at least one field, or omit it entirely for raw matrix mode.'
  }

  const isValidField = (f: SpreadsheetFieldSpec): boolean =>
    !!f && typeof f.id === 'string' && f.id !== '' && typeof f.label === 'string' && f.label !== ''
  const badColumnIndex = columns?.findIndex((f) => !isValidField(f))
  if (badColumnIndex != null && badColumnIndex !== -1) {
    return `columns[${badColumnIndex}] must be a { id, label } object with non-empty string fields.`
  }
  const badRowIndex = rows?.findIndex((f) => !isValidField(f))
  if (badRowIndex != null && badRowIndex !== -1) {
    return `rows[${badRowIndex}] must be a { id, label } object with non-empty string fields.`
  }

  const hasColumns = !!columns && columns.length > 0
  const hasRows = !!rows && rows.length > 0

  if (hasColumns) {
    const dup = firstDuplicateId(columns)
    if (dup) return `duplicate column id "${dup}" — every declared column id must be unique.`
  }
  if (hasRows) {
    const dup = firstDuplicateId(rows)
    if (dup) return `duplicate row id "${dup}" — every declared row id must be unique.`
  }

  if (columnHeader && rowHeader) {
    return 'columnHeader and rowHeader cannot both be true — pick one orientation for the persisted sheet shape.'
  }
  if (hasColumns && hasRows) {
    return 'columns and rows cannot both be declared — pick one orientation for the persisted sheet shape.'
  }
  if (columnHeader && !hasColumns) {
    return 'columnHeader is true but columns is missing or empty — declare the column list columnHeader positions map to.'
  }
  if (rowHeader && !hasRows) {
    return 'rowHeader is true but rows is missing or empty — declare the row list rowHeader positions map to.'
  }
  return null
}

// Shapes a raw matrix into what gets persisted as `sheet`. Never touches
// formula evaluation — only ever called when building the PERSISTED value,
// after derivations are already computed against the (possibly already
// columns/rows-normalized, see SpreadsheetControl.tsx) matrix.
//
// `columns`/`rows` are the SOLE source of a record's keys, assigned strictly
// by POSITION — column/row i of the real data maps to fields[i].id,
// regardless of what (if anything) is in a skipped header row/column.
// columnHeader/rowHeader mean only "skip an extra header row/column in this
// matrix, discard its content unread" — never "read it for keys". This is a
// deliberate choice over matching declared ids against real header text: a
// database round trip (e.g. Postgres JSONB, which does not preserve object
// key insertion order) can never invalidate a positional assignment the way
// it can silently scramble a text-matched one.
export function shapeSheet(matrix: CellValue[][], options: ShapeSheetOptions = {}): SheetData {
  const configError = validateSpreadsheetConfig(options)
  if (configError) throw new Error(`x-spreadsheet: ${configError}`)
  const { columnHeader, rowHeader, columns, rows } = options
  if (columns && columns.length > 0) return rowsToRecords(matrix, columns, columnHeader === true)
  if (rows && rows.length > 0) return columnsToRecords(matrix, rows, rowHeader === true)
  return matrix
}

// columnHeader: discard matrix[0] UNREAD when skipHeaderRow (whatever text,
// if any, is in it), then every remaining row's cell at index i maps to
// fields[i].id — position only, never by matching text. A data row shorter
// than fields fills the missing trailing values with null; a row longer
// than fields silently drops its undeclared trailing cells.
function rowsToRecords(
  matrix: CellValue[][],
  fields: SpreadsheetFieldSpec[],
  skipHeaderRow: boolean,
): Record<string, CellValue>[] {
  const dataRows = skipHeaderRow ? matrix.slice(1) : matrix
  return dataRows.map((row) => {
    // Object.create(null), not {} — a declared id of "__proto__" would
    // otherwise set the record's prototype instead of creating an
    // enumerable own property, silently dropping that column from
    // Object.keys/entries and JSON serialization. Same fix already applied
    // to the derivations accumulator below (#32).
    const record: Record<string, CellValue> = Object.create(null)
    fields.forEach((field, i) => {
      record[field.id] = row[i] ?? null
    })
    return record
  })
}

// rowHeader: discard column 0 of every row UNREAD when skipHeaderColumn,
// then every OTHER column becomes one record, transposed — symmetric to
// rowsToRecords, fields[r].id assigned to row r's data, by position.
function columnsToRecords(
  matrix: CellValue[][],
  fields: SpreadsheetFieldSpec[],
  skipHeaderColumn: boolean,
): Record<string, CellValue>[] {
  const colOffset = skipHeaderColumn ? 1 : 0
  const width = Math.max(0, ...matrix.map((row) => row.length))
  const colCount = Math.max(0, width - colOffset)
  return Array.from({ length: colCount }, (_, i) => {
    const col = colOffset + i
    const record: Record<string, CellValue> = Object.create(null)
    fields.forEach((field, r) => {
      record[field.id] = matrix[r]?.[col] ?? null
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

// Folds evaluation results into the persisted map, for SpreadsheetControl's
// evaluation effect — the one place this package turns results into a stored
// value, whether the rows came from an upload or from an importer's write.
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
// Used as the write guard when SpreadsheetControl reads from a path, where the
// value is an object rebuilt on every evaluation — so a reference check would
// always report a change and dirty the form merely by opening a saved record.
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

// One row of either SheetData shape: a matrix row is an array of cells, a
// records row is a plain object. A shape mismatch is a difference, not a
// coercion — the two are never interchangeable.
function sameSheetRow(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a === b
  const isMatrixRow = Array.isArray(a)
  if (isMatrixRow !== Array.isArray(b)) return false

  if (isMatrixRow) {
    const left = a as CellValue[]
    const right = b as CellValue[]
    return left.length === right.length && left.every((cell, i) => sameValue(cell, right[i]))
  }

  const left = a as Record<string, CellValue>
  const right = b as Record<string, CellValue>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && sameValue(left[key], right[key]))
}

// Structural equality for two persisted sheets, on the same terms as
// sameDerivations above: never JSON.stringify, and a Date has to compare equal
// to the ISO string it round-trips to through JSON storage.
//
// Used as the write guard in SpreadsheetControl's evaluation effect, where the
// shaped sheet is rebuilt on every run. Without it, opening a saved form would
// rewrite an identical sheet and mark it dirty on
// mount. Comparing whole sheets is affordable because the effect it guards runs
// only when the resolved source's reference changes, not on every keystroke.
export function sameSheetData(a: SheetData | undefined, b: SheetData | undefined): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  const left = a as unknown[]
  const right = b as unknown[]
  if (left.length !== right.length) return false
  return left.every((row, i) => sameSheetRow(row, right[i]))
}
