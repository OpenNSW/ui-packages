import type { JsonSchema } from '@jsonforms/core'

// Excel-backed table fields are declared entirely in the JSON schema, via an
// `x-excel` block on a `format: "file"` property. The schema names the sibling
// array the parsed rows are written to, how to recognise each column in the
// uploaded sheet, and which sibling fields to derive from the rows. No
// column names, formulas, or domain knowledge live in this package.
//
//   "sales_file": {
//     "type": "string", "format": "file",
//     "x-file":  { "accept": ".xlsx" },
//     "x-excel": {
//       "target": "sales",
//       "columns": {
//         "quantity_kg": { "match": ["qty in kg", "quantity in kg"], "type": "number" }
//       },
//       "derive": {
//         "total_quantity_kg": { "op": "sum", "column": "quantity_kg" }
//       }
//     }
//   }

export type ExcelColumnSpec = {
  // Header texts that identify this column, compared case/space/punctuation
  // insensitively. The first spelling that matches a header cell wins.
  match: string[]
  type?: 'string' | 'number' | 'date'
  required?: boolean
}

export type ExcelDeriveSpec =
  // SUM(column)
  | { op: 'sum'; column: string }
  // SUM(numerator) / SUM(denominator) — e.g. avg rate per kg is a
  // quantity-weighted average, not the mean of the per-row rates.
  | { op: 'ratio'; numerator: string; denominator: string; precision?: number }
  // The value of `column` on the rows carrying the most `weightBy`; falls back
  // to row count when weightBy is absent. Ties and genuine mixes are joined.
  | { op: 'dominant'; column: string; weightBy?: string }
  | { op: 'count' }

export type ExcelSpec = {
  target: string
  columns: Record<string, ExcelColumnSpec>
  derive?: Record<string, ExcelDeriveSpec>
  // How far down the sheet to hunt for the header row before giving up.
  headerSearchRows?: number
  sheet?: number | string
}

export type ParsedExcelTable = {
  rows: Record<string, unknown>[]
  derived: Record<string, unknown>
  // Columns declared in the spec that no header in the sheet matched. Surfaced
  // to the trader so a renamed template column is visible rather than silently
  // producing blank cells.
  missingColumns: string[]
  skippedRows: number
}

const DEFAULT_HEADER_SEARCH_ROWS = 25

// Matched against a whole normalised cell, so a garden mark like
// "TOTAL ESTATE" is not mistaken for a totals row.
const TOTALS_ROW_LABEL = /^(grand |sub )?totals?$/

export function getExcelSpec(schema: JsonSchema | undefined): ExcelSpec | undefined {
  const spec = (schema as Record<string, unknown> | undefined)?.['x-excel']
  if (!spec || typeof spec !== 'object') return undefined
  const candidate = spec as Partial<ExcelSpec>
  if (typeof candidate.target !== 'string' || !candidate.columns) return undefined
  return candidate as ExcelSpec
}

// Cell values arrive as whatever the workbook declared — string, number,
// boolean, Date, or null. Anything else (a formula object, a rich-text run)
// has no meaningful text form, so it reads as empty rather than
// "[object Object]".
function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  return ''
}

// Header cells are matched on a normalised form so that "Rate\nPer KG",
// "RATE PER KG" and "Rate per Kg." all collapse to the same key.
function normalise(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (value instanceof Date) return undefined
  const cleaned = text(value).replace(/[\s,]/g, '')
  if (cleaned === '') return undefined
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toDateString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const raw = text(value).trim()
  if (raw === '') return undefined
  // Excel commonly hands back dd/mm/yyyy for the region's templates; ISO is
  // what the JSON schema's `format: "date"` fields expect.
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Anything that isn't recognisably a date is not a date. Passing the raw
  // text through would let a template's trailing "TOTAL" row satisfy a
  // required date column and be counted as a sale.
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString().slice(0, 10)
}

function coerce(value: unknown, type: ExcelColumnSpec['type']): unknown {
  if (value === null || value === undefined || value === '') return undefined
  switch (type) {
    case 'number':
      return toNumber(value)
    case 'date':
      return toDateString(value)
    default:
      return value instanceof Date ? toDateString(value) : text(value).trim()
  }
}

// Locates the header row by scoring each candidate row on how many declared
// columns it matches, and returns the winning row's field -> column index map.
// Scanning rather than assuming row 1 is what lets the parser survive the
// title/banner rows the ASYCUDA-style templates carry above the grid.
function findHeader(
  grid: unknown[][],
  columns: Record<string, ExcelColumnSpec>,
  searchRows: number,
): { rowIndex: number; indexByField: Record<string, number> } | undefined {
  const lookup = new Map<string, string>()
  for (const [field, spec] of Object.entries(columns)) {
    for (const alias of spec.match) lookup.set(normalise(alias), field)
  }

  let best: { rowIndex: number; indexByField: Record<string, number>; score: number } | undefined
  const limit = Math.min(grid.length, searchRows)

  for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
    const indexByField: Record<string, number> = {}
    grid[rowIndex]?.forEach((cell, columnIndex) => {
      const field = lookup.get(normalise(cell))
      if (field !== undefined && indexByField[field] === undefined) {
        indexByField[field] = columnIndex
      }
    })
    const score = Object.keys(indexByField).length
    if (score > (best?.score ?? 0)) best = { rowIndex, indexByField, score }
  }

  // One lucky match is noise — a real header row lines up on several columns.
  if (!best || best.score < Math.min(2, Object.keys(columns).length)) return undefined
  return { rowIndex: best.rowIndex, indexByField: best.indexByField }
}

// Returns undefined when no row carries a usable number for the column —
// typically because the sheet omits it altogether. That is distinct from a
// column whose values genuinely add up to zero, and the two must not collapse:
// reporting 0 would present a missing column as a real figure.
function sum(rows: Record<string, unknown>[], column: string): number | undefined {
  let total = 0
  let contributors = 0
  for (const row of rows) {
    const value = toNumber(row[column])
    if (value === undefined) continue
    total += value
    contributors++
  }
  return contributors === 0 ? undefined : total
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

export function deriveValues(
  rows: Record<string, unknown>[],
  derive: Record<string, ExcelDeriveSpec> | undefined,
): Record<string, unknown> {
  const derived: Record<string, unknown> = {}
  if (!derive) return derived

  for (const [field, spec] of Object.entries(derive)) {
    switch (spec.op) {
      case 'sum': {
        const total = sum(rows, spec.column)
        derived[field] = total === undefined ? undefined : round(total, 2)
        break
      }
      case 'ratio': {
        const numerator = sum(rows, spec.numerator)
        const denominator = sum(rows, spec.denominator)
        // A missing column on either side, or an all-zero denominator, means
        // the sheet cannot support a rate. Leave the field empty rather than
        // publishing 0 or NaN as if it were the real figure.
        derived[field] =
          numerator === undefined || denominator === undefined || denominator === 0
            ? undefined
            : round(numerator / denominator, spec.precision ?? 2)
        break
      }
      case 'dominant': {
        const weights = new Map<string, number>()
        for (const row of rows) {
          const key = text(row[spec.column]).trim()
          if (key === '') continue
          const weight = spec.weightBy ? (toNumber(row[spec.weightBy]) ?? 0) : 1
          weights.set(key, (weights.get(key) ?? 0) + weight)
        }
        if (weights.size === 0) {
          derived[field] = undefined
        } else {
          const ranked = [...weights.entries()].sort((a, b) => b[1] - a[1])
          const top = ranked[0][1]
          // Everything sharing the top weight is reported, so a genuine
          // multi-grade blend reads "BOP, BOP FANNINGS" instead of silently
          // dropping half the consignment's grades.
          derived[field] = ranked
            .filter(([, weight]) => weight === top)
            .map(([key]) => key)
            .join(', ')
        }
        break
      }
      case 'count':
        derived[field] = rows.length
        break
    }
  }
  return derived
}

// The parse proper, split from the file read so it can be exercised against a
// grid from any source.
export function parseSheetGrid(grid: unknown[][], spec: ExcelSpec): ParsedExcelTable {
  const header = findHeader(grid, spec.columns, spec.headerSearchRows ?? DEFAULT_HEADER_SEARCH_ROWS)
  if (!header) {
    const expected = Object.values(spec.columns)
      .map((column) => column.match[0])
      .join(', ')
    throw new Error(`Could not find a header row in the uploaded sheet. Expected columns such as: ${expected}.`)
  }

  const requiredFields = Object.entries(spec.columns)
    .filter(([, column]) => column.required)
    .map(([field]) => field)

  const rows: Record<string, unknown>[] = []
  let skippedRows = 0

  for (let rowIndex = header.rowIndex + 1; rowIndex < grid.length; rowIndex++) {
    const raw = grid[rowIndex]
    if (!raw) continue
    // Templates close the grid with a totals row. Recognising it explicitly
    // keeps its figures out of the aggregates even if it happens to carry
    // values in every required column.
    if (raw.some((cell) => TOTALS_ROW_LABEL.test(normalise(cell)))) continue

    const row: Record<string, unknown> = {}
    for (const [field, columnIndex] of Object.entries(header.indexByField)) {
      const value = coerce(raw[columnIndex], spec.columns[field]?.type)
      if (value !== undefined) row[field] = value
    }

    // Templates carry blank spacer rows and trailing total rows; a row is only
    // real if it carries every required field.
    if (Object.keys(row).length === 0) continue
    if (requiredFields.some((field) => row[field] === undefined)) {
      skippedRows++
      continue
    }
    rows.push(row)
  }

  const missingColumns = Object.entries(spec.columns)
    .filter(([field]) => header.indexByField[field] === undefined)
    .map(([, column]) => column.match[0])

  return { rows, derived: deriveValues(rows, spec.derive), missingColumns, skippedRows }
}

export async function parseExcelTable(file: File, spec: ExcelSpec): Promise<ParsedExcelTable> {
  // Imported on demand. The spreadsheet reader is a few hundred kilobytes and
  // only forms that declare an x-excel field ever need it, so it must not sit
  // in the entry chunk of every application that uses this renderer set.
  const { readSheet } = await import('read-excel-file/browser')
  const grid = (await readSheet(file, spec.sheet ?? 1)) as unknown[][]
  return parseSheetGrid(grid, spec)
}
