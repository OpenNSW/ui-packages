// Evaluates Excel formulas over the rows parsed out of an uploaded sheet.
//
// A derived field is an ordinary Excel expression, with the parsed columns
// addressed by name rather than by cell:
//
//   "avg_rate_per_kg": "ROUND(SUM(total_value) / SUM(quantity_kg), 2)"
//   "grade_standard":  "INDEX(grade, MATCH(MAX(quantity_kg), quantity_kg, 0))"
//
// Column names are resolved against the *parsed* rows, not the raw sheet.
// That is deliberate: the row parser finds the header by scoring rather than
// assuming a position, so raw cell ranges would drift the moment a template
// gained a banner row, and a range like SUM(I:I) would silently swallow the
// template's trailing TOTAL row and double the figure. Referring to columns by
// name keeps a formula correct regardless of where the grid sits or what order
// its columns are in.
//
// For values that genuinely live at a fixed address — the header block above
// the grid, which has no columns to match — `cell(B2)` reads the raw sheet:
//
//   "blend_sheet_no": "cell(B2)"
//   "blend_summary":  "CONCATENATE(cell(B2), \" / \", cell(D2))"

import * as formulajs from '@formulajs/formulajs'

// A1 -> zero-based { row, col }. Only used for cell() substitution.
function parseA1(ref: string): { row: number; col: number } | undefined {
  const m = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(ref.trim())
  if (!m) return undefined
  const letters = m[1].toUpperCase()
  let col = 0
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { row: Number(m[2]) - 1, col: col - 1 }
}

// Zero-based column index -> spreadsheet letters.
function toColumnLetters(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

function isFormulaError(value: unknown): boolean {
  return typeof value === 'object' && value !== null && '_error' in value
}

// Renders a raw cell value as a formula literal for cell() substitution.
function toLiteral(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '""'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return `"${value.toISOString().slice(0, 10)}"`
  // Excel escapes a quote inside a string literal by doubling it.
  if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`
  // Empty cells, and anything with no meaningful text form, read as blank.
  return '""'
}

// Splits a formula into quoted and unquoted segments so rewrites never reach
// inside a string literal.
function mapOutsideStrings(formula: string, transform: (segment: string) => string): string {
  let out = ''
  let index = 0
  while (index < formula.length) {
    const quote = formula.indexOf('"', index)
    if (quote === -1) {
      out += transform(formula.slice(index))
      break
    }
    out += transform(formula.slice(index, quote))
    // Consume the literal, honouring "" as an escaped quote.
    let end = quote + 1
    while (end < formula.length) {
      if (formula[end] === '"') {
        if (formula[end + 1] === '"') end += 2
        else break
      } else end++
    }
    out += formula.slice(quote, end + 1)
    index = end + 1
  }
  return out
}

// Values a range hands to a backfilled function arrive either bare, wrapped in
// { value }, or as a 2-D array. Flatten all of it to a plain list.
function flatten(arg: unknown): unknown[] {
  // `'value' in arg` narrows the object, so no assertion is needed here.
  const value = typeof arg === 'object' && arg !== null && 'value' in arg ? arg.value : arg
  return Array.isArray(value) ? value.flat(Infinity) : [value]
}

function scalar(arg: unknown): unknown {
  const [first] = flatten(arg)
  return first
}

// formulajs ships no useful types for these entry points, so the surface this
// module relies on is stated explicitly. That keeps every call type-checked
// instead of silently `any`.
const fj = formulajs as unknown as {
  MAX(values: unknown[]): unknown
  MIN(values: unknown[]): unknown
  COUNTA(values: unknown[]): unknown
  MATCH(value: unknown, array: unknown[], type: unknown): unknown
  TEXTJOIN(delimiter: unknown, ignoreEmpty: unknown, values: unknown[]): unknown
}

// fast-formula-parser implements most of Excel but not these, and they are
// needed for the everyday aggregate-and-look-up shape a derived field takes.
// formulajs supplies the implementations; the wrappers only normalise argument
// shapes. Any other function resolves against the parser's own set, and an
// unsupported one reports "Function X is not implemented".
function backfilledFunctions(): Record<string, (...args: unknown[]) => unknown> {
  const overAllArgs =
    (fn: (values: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(args.flatMap(flatten))

  return {
    MAX: overAllArgs((v) => fj.MAX(v)),
    MIN: overAllArgs((v) => fj.MIN(v)),
    COUNTA: overAllArgs((v) => fj.COUNTA(v)),
    MATCH: (value: unknown, array: unknown, type?: unknown) =>
      fj.MATCH(scalar(value), flatten(array), type === undefined ? 1 : scalar(type)),
    TEXTJOIN: (delimiter: unknown, ignoreEmpty: unknown, ...rest: unknown[]) =>
      fj.TEXTJOIN(scalar(delimiter), scalar(ignoreEmpty), rest.flatMap(flatten)),
  }
}

export type FormulaEvaluator = {
  // Returns the computed value, or undefined when the formula could not
  // produce one. `error` carries the reason in that case.
  evaluate(formula: string): { value?: unknown; error?: string }
}

// fast-formula-parser ships as CommonJS with no ESM entry, so the shape of the
// dynamic import differs between bundlers and Node.
type ParserModule = {
  new (options: unknown): { parse(formula: string, position: unknown): unknown }
}

/**
 * Builds an evaluator over a set of parsed rows.
 *
 * @param fields        Column keys in declaration order — position determines
 *                      which spreadsheet column each name is rewritten to.
 * @param rows          The parsed rows; one virtual sheet row each, so no
 *                      banner or totals row is addressable.
 * @param rawGrid       The original sheet, for `cell()` lookups only.
 * @param missingFields Declared columns that no header in the sheet matched.
 *                      Excel sums an empty range to 0, so a formula touching
 *                      one of these would report a confident zero for a column
 *                      the sheet never had. Such formulas fail instead.
 */
export async function createFormulaEvaluator(
  fields: string[],
  rows: Record<string, unknown>[],
  rawGrid: unknown[][],
  missingFields: string[] = [],
): Promise<FormulaEvaluator> {
  const imported = (await import('fast-formula-parser')) as unknown as ParserModule & { default?: ParserModule }
  const FormulaParser = imported.default ?? imported

  // Virtual grid: one column per declared field, one row per parsed row.
  const grid = rows.map((row) => fields.map((field) => row[field] ?? null))

  const cellAt = (row: number, col: number): unknown => grid[row - 1]?.[col - 1] ?? null

  const parser = new FormulaParser({
    onCell: ({ row, col }: { row: number; col: number }) => cellAt(row, col),
    onRange: (ref: { from: { row: number; col: number }; to: { row: number; col: number } }) => {
      const lastRow = Math.min(ref.to.row, grid.length)
      const out: unknown[][] = []
      for (let r = ref.from.row; r <= lastRow; r++) {
        const line: unknown[] = []
        for (let c = ref.from.col; c <= ref.to.col; c++) line.push(cellAt(r, c))
        out.push(line)
      }
      return out
    },
    functions: backfilledFunctions(),
  })

  const columnRange = new Map<string, string>()
  fields.forEach((field, index) => {
    const letters = toColumnLetters(index)
    columnRange.set(field, `${letters}1:${letters}${rows.length}`)
  })

  // Longest name first so `total_value` is not partially matched by `total`.
  const names = [...columnRange.keys()].sort((a, b) => b.length - a.length)
  const namePattern =
    names.length > 0
      ? new RegExp(`\\b(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g')
      : undefined

  const rewrite = (formula: string): { rewritten: string; referenced: Set<string> } => {
    const referenced = new Set<string>()
    // cell(B2) is substituted with a literal from the raw sheet before the
    // parser sees it, so raw addresses never collide with the virtual grid.
    const withCells = mapOutsideStrings(formula, (segment) =>
      segment.replace(/\bcell\s*\(\s*([A-Za-z]{1,3}\d{1,7})\s*\)/gi, (_match, ref: string) => {
        const at = parseA1(ref)
        return at ? toLiteral(rawGrid[at.row]?.[at.col]) : '""'
      }),
    )

    if (!namePattern) return { rewritten: withCells, referenced }

    const rewritten = mapOutsideStrings(withCells, (segment) =>
      // A name directly followed by "(" is a function call, not a column.
      segment.replace(namePattern, (match, name: string, offset: number) => {
        const after = segment.slice(offset + match.length)
        if (/^\s*\(/.test(after)) return match
        const range = columnRange.get(name)
        if (range === undefined) return match
        referenced.add(name)
        return range
      }),
    )
    return { rewritten, referenced }
  }

  const missing = new Set(missingFields)

  return {
    evaluate(formula: string) {
      // With no rows there is no range to address; every aggregate would be
      // over an empty set, so report nothing rather than a misleading zero.
      if (rows.length === 0) return { error: 'no rows were parsed from the sheet' }

      const { rewritten, referenced } = rewrite(formula)

      // Excel sums an empty range to 0, so without this a formula over a
      // column the sheet never contained would publish a confident zero.
      const absent = [...referenced].filter((name) => missing.has(name))
      if (absent.length > 0) {
        return { error: `${absent.join(', ')} ${absent.length === 1 ? 'was' : 'were'} not found in the sheet` }
      }

      let result: unknown
      try {
        result = parser.parse(rewritten, { row: 1, col: 1, sheet: 'Sheet1' })
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'could not evaluate the formula' }
      }

      if (isFormulaError(result)) {
        return { error: String((result as { _error: string })._error) }
      }
      if (result === null || result === undefined || result === '') return {}
      return { value: result }
    },
  }
}
