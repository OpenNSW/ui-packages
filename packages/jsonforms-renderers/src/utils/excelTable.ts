import type { JsonSchema } from '@jsonforms/core'

// Excel-backed table fields are declared entirely in the JSON schema, via an
// `x-excel` block on a `format: "file"` property. The schema names the sibling
// array the parsed rows are written to, how to recognise each column in the
// uploaded sheet, and which sibling fields to derive from the rows. No
// column names, formulas, or domain knowledge live in this package.
//
//   "sales_file": {
//     "type": "string", "format": "file",
//     "x-file":  { "accept": ".xlsx,.xlsm" },
//     "x-excel": {
//       "target": "sales",
//       "columns": {
//         "quantity_kg": { "match": ["qty in kg", "quantity in kg"], "type": "number" },
//         "total_value": { "match": ["total value"], "type": "number" }
//       },
//       "derive": {
//         "total_quantity_kg": "SUM(quantity_kg)",
//         "avg_rate_per_kg":   "ROUND(SUM(total_value) / SUM(quantity_kg), 2)"
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

export type ExcelSpec = {
  target: string
  columns: Record<string, ExcelColumnSpec>
  // Sibling field -> Excel formula over the parsed columns. See excelFormula.ts
  // for the addressing rules.
  derive?: Record<string, string>
  // How far down the sheet to hunt for the header row before giving up.
  headerSearchRows?: number
  sheet?: number | string
}

export type ParsedSheetRows = {
  rows: Record<string, unknown>[]
  // Declared columns that no header in the sheet matched, as their first
  // `match` spelling. Surfaced to the trader so a renamed template column is
  // visible rather than silently producing blank cells.
  missingColumns: string[]
  // The same set as field keys, for callers that need to reason about it
  // programmatically. Distinct from "every row's cell was blank": a column can
  // match its header and still carry no values, and that is not missing.
  missingFields: string[]
  skippedRows: number
}

export type ParsedExcelTable = ParsedSheetRows & {
  derived: Record<string, unknown>
  // Derived field -> why its formula produced no value. A formula that fails
  // must say so; a silently empty total reads as "the sheet had none".
  derivedErrors: Record<string, string>
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

/**
 * Evaluates every `derive` formula against the parsed rows.
 *
 * Split from parseSheetGrid because it is async — the formula engine is loaded
 * on demand — and because the row parse is useful on its own.
 */
export async function evaluateDerived(
  parsed: ParsedSheetRows,
  spec: ExcelSpec,
  rawGrid: unknown[][],
): Promise<{ derived: Record<string, unknown>; derivedErrors: Record<string, string> }> {
  const derived: Record<string, unknown> = {}
  const derivedErrors: Record<string, string> = {}
  const entries = Object.entries(spec.derive ?? {})
  if (entries.length === 0) return { derived, derivedErrors }

  const { createFormulaEvaluator } = await import('./excelFormula')
  // All declared field keys, including any the sheet did not carry, so column
  // positions stay stable. parsed.missingFields names the ones whose header
  // never matched, which the evaluator reports rather than silently summing to
  // zero — a column that matched but happens to be blank is not in that set and
  // aggregates normally, as Excel would.
  const evaluator = await createFormulaEvaluator(Object.keys(spec.columns), parsed.rows, rawGrid, parsed.missingFields)

  for (const [field, formula] of entries) {
    if (typeof formula !== 'string') {
      derivedErrors[field] = 'derive entries must be Excel formula strings'
      continue
    }
    const { value, error } = evaluator.evaluate(formula)
    if (error !== undefined) derivedErrors[field] = error
    derived[field] = value
  }

  return { derived, derivedErrors }
}

// The row parse proper, split from the file read so it can be exercised against
// a grid from any source. Derived values are computed separately, by
// evaluateDerived.
export function parseSheetGrid(grid: unknown[][], spec: ExcelSpec): ParsedSheetRows {
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

  // Whether a header matched is known exactly here; do not re-derive it later
  // from the row values, which cannot tell an unmatched column apart from a
  // matched one whose cells are all blank.
  const unmatched = Object.entries(spec.columns).filter(([field]) => header.indexByField[field] === undefined)
  const missingColumns = unmatched.map(([, column]) => column.match[0])
  const missingFields = unmatched.map(([field]) => field)

  return { rows, missingColumns, missingFields, skippedRows }
}

export async function parseExcelTable(file: File, spec: ExcelSpec): Promise<ParsedExcelTable> {
  // Imported on demand. The spreadsheet reader and the formula engine together
  // run to a few hundred kilobytes, and only forms that declare an x-excel
  // field ever need them, so they must not sit in the entry chunk of every
  // application that uses this renderer set.
  const { readSheet } = await import('read-excel-file/browser')
  const grid = (await readSheet(file, spec.sheet ?? 1)) as unknown[][]
  const parsed = parseSheetGrid(grid, spec)
  const { derived, derivedErrors } = await evaluateDerived(parsed, spec, grid)
  return { ...parsed, derived, derivedErrors }
}
