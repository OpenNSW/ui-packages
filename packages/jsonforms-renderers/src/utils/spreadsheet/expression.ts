import type { CellRef, FormulaError as LibFormulaErrorClass, RangeRef } from 'fast-formula-parser'
import { assertAllowedFunctions, backfilledFunctions } from './formulaFunctions'
import { FormulaError } from './reference'
import type { CellValue, FormulaConfigEntry, FormulaErrorCode, FormulaResult, Matrix } from './types'

// A thin integration layer over `fast-formula-parser` (parsing + evaluation),
// backfilled by `@formulajs/formulajs` for functions the former only stubs
// out or gets wrong for this app's data — see docs/spreadsheet-formulas.md
// for the supported function list, the license rationale, and the known
// IF/IFERROR short-circuiting limitation referenced in `onRange` below.
//
// This file owns: the allowlist pre-scan (formulaFunctions.ts) running before
// a formula ever reaches the parser; bridging the library's `onCell`/
// `onRange` hooks to this package's own `Matrix`; and normalizing however the
// library reports an error (thrown exception vs. a computed error value) back
// onto this package's own `FormulaErrorCode` union.

// fast-formula-parser ships as CommonJS with no ESM entry, so a dynamic
// `import()` of it can resolve to either `{ default: FormulaParser }` or the
// constructor itself depending on the consumer's bundler/runtime — confirmed
// empirically to differ between plain Node ESM interop and others, so both
// shapes are handled rather than assumed. `FormulaError` is then read off the
// *resolved* constructor's own static property (`FormulaParser.FormulaError`)
// rather than off the module namespace, since that's the one place it's
// guaranteed to exist regardless of interop shape.
type FormulaHooks = {
  onCell: (ref: CellRef) => unknown
  onRange: (ref: RangeRef) => unknown[][]
  // The library's own "defined name" mechanism — a bare identifier in a
  // formula (not an A1-style cell address) resolves through this hook to a
  // CellRef/RangeRef, which is then routed through onCell/onRange exactly
  // like a real reference. Returning null makes the library itself report
  // #NAME? for an unrecognized name, for free. See evaluateFormulaWithVariables.
  onVariable?: (name: string, sheetName?: string, position?: CellRef) => CellRef | RangeRef | null
}

type FormulaParserCtor = new (
  options: FormulaHooks & { functions: Record<string, (...args: unknown[]) => unknown> },
) => { parse(formula: string, position: CellRef): unknown }

type LibFormulaErrorCtor = typeof LibFormulaErrorClass

const LIB_ERROR_TO_CODE: Record<string, FormulaErrorCode> = {
  '#REF!': 'REF',
  '#VALUE!': 'VALUE',
  '#DIV/0!': 'DIV0',
  '#NAME?': 'NAME',
  '#N/A': 'NA',
  '#NUM!': 'NUM',
  '#NULL!': 'NULL',
}

function codeFromLibraryError(err: InstanceType<LibFormulaErrorCtor>): FormulaErrorCode {
  return LIB_ERROR_TO_CODE[err.error] ?? 'ERROR'
}

// Normalizes anything `parser.parse()` might throw, or return as an error
// value, onto this package's own FormulaError — preferring the most specific
// code available over the library's generic `#ERROR!` wrapper.
function toFormulaError(caught: unknown, LibFormulaError: LibFormulaErrorCtor): FormulaError {
  if (caught instanceof FormulaError) return caught
  if (caught instanceof LibFormulaError) {
    const details: unknown = caught.details
    if (details instanceof FormulaError) return details
    if (details instanceof LibFormulaError) return new FormulaError(codeFromLibraryError(details), details.message)
    return new FormulaError(codeFromLibraryError(caught), caught.message)
  }
  return new FormulaError('ERROR', caught instanceof Error ? caught.message : undefined)
}

function actualWidth(matrix: Matrix): number {
  return Math.max(0, ...matrix.map((row) => (row as unknown[] | undefined)?.length ?? 0))
}

// 1-based `{row, col}` in, `matrix[row-1][col-1]` out. A blank cell (missing,
// `null`, or `''`) resolves to `null`; anything genuinely out of the sheet's
// bounds throws REF rather than silently reading as blank — an invalid
// reference is a mistake worth surfacing, not a legitimate blank.
function makeOnCell(matrix: Matrix) {
  return (ref: CellRef): CellValue => {
    const dataRow = matrix[ref.row - 1] as CellValue[] | undefined
    if (ref.row < 1 || ref.col < 1 || dataRow == null || ref.col - 1 >= dataRow.length) {
      throw new FormulaError('REF')
    }
    const cell = dataRow[ref.col - 1]
    return cell == null || cell === '' ? null : cell
  }
}

// 1-based range in, a clamped 2-D `CellValue[][]` out. Two safety properties
// fast-formula-parser doesn't provide on its own: never build an array out to
// the range's literal (possibly enormous) end — clamp to the matrix's actual
// bounds first — and if the range's *start* row/column is entirely beyond the
// sheet (not just sparse near the edges), throw REF instead of silently
// resolving to an empty range (which would let e.g. SUM return a confident 0
// for a typo'd column). See docs/spreadsheet-formulas.md for the resulting
// IF/IFERROR short-circuiting limitation this throw causes.
function makeOnRange(matrix: Matrix) {
  return (ref: RangeRef): CellValue[][] => {
    const startRow = Math.min(ref.from.row, ref.to.row)
    const startCol = Math.min(ref.from.col, ref.to.col)
    const endRowRaw = Math.max(ref.from.row, ref.to.row)
    const endColRaw = Math.max(ref.from.col, ref.to.col)

    const width = actualWidth(matrix)
    if (startRow > matrix.length || startCol > width) {
      throw new FormulaError('REF')
    }

    const endRow = Math.min(endRowRaw, matrix.length)
    const out: CellValue[][] = []
    for (let r = startRow; r <= endRow; r++) {
      const dataRow = matrix[r - 1] as CellValue[] | undefined
      const rowOut: CellValue[] = []
      if (dataRow != null) {
        const endCol = Math.min(endColRaw, dataRow.length)
        for (let c = startCol; c <= endCol; c++) {
          const cell = dataRow[c - 1]
          rowOut.push(cell == null || cell === '' ? null : cell)
        }
      }
      out.push(rowOut)
    }
    return out
  }
}

function normalizeResult(result: unknown): CellValue {
  if (result === undefined || result === null || result === '') return null
  if (
    typeof result === 'number' ||
    typeof result === 'string' ||
    typeof result === 'boolean' ||
    result instanceof Date
  ) {
    return result
  }
  // The library's own top-level `checkFormulaResult` already collapses
  // arrays/objects (or reports `#VALUE!`) before `parse()` ever returns a
  // plain value, so this should be unreachable — kept as a defensive VALUE
  // rather than a silent wrong answer.
  throw new FormulaError('VALUE')
}

// Internal building block: strips the leading `=` (tolerating its absence),
// runs the allowlist pre-scan, then delegates parsing and evaluation to
// fast-formula-parser using whichever hooks the caller supplies (a real
// matrix's onCell/onRange for evaluateExpression, or a variables-only set for
// evaluateFormulaWithVariables — see below). Throws FormulaError on failure.
// Both libraries are dynamically imported here (not as static top-level
// imports) so the formula-evaluation code splits into an on-demand chunk only
// fetched when a form actually needs it — consumers who never touch a
// formula-bearing field never pay for either dependency.
async function evaluateWithHooks(expression: string, hooks: FormulaHooks): Promise<CellValue> {
  if (typeof expression !== 'string') throw new FormulaError('ERROR')

  const trimmed = expression.trim()
  if (trimmed === '') throw new FormulaError('ERROR')

  const body = trimmed.startsWith('=') ? trimmed.slice(1) : trimmed

  // Runs before `body` ever reaches the parser — see formulaFunctions.ts.
  assertAllowedFunctions(body)

  const [ffpModule, fj] = await Promise.all([
    import('fast-formula-parser') as unknown as Promise<{ default?: FormulaParserCtor } & Record<string, unknown>>,
    import('@formulajs/formulajs'),
  ])
  const FormulaParser = (ffpModule.default ?? (ffpModule as unknown as FormulaParserCtor)) as FormulaParserCtor
  const LibFormulaError = (FormulaParser as unknown as { FormulaError: LibFormulaErrorCtor }).FormulaError

  const parser = new FormulaParser({
    ...hooks,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- formulajs's own types are all `any`-typed; formulaFunctions.ts narrows the surface it actually calls.
    functions: backfilledFunctions(fj as any, LibFormulaError),
  })

  let result: unknown
  try {
    result = parser.parse(body, { row: 1, col: 1, sheet: 'Sheet1' })
  } catch (caught) {
    throw toFormulaError(caught, LibFormulaError)
  }

  if (result instanceof LibFormulaError) {
    throw toFormulaError(result, LibFormulaError)
  }

  return normalizeResult(result)
}

export async function evaluateExpression(matrix: Matrix, expression: string): Promise<CellValue> {
  return evaluateWithHooks(expression, { onCell: makeOnCell(matrix), onRange: makeOnRange(matrix) })
}

// Sentinel row for a synthetic "variables row" — must be truthy (the
// library's own `checkFormulaResult` treats a bare top-level dereference as
// `result.ref.row && !result.ref.from`, so `row: 0` would silently fail that
// check and produce a false #VALUE! for a formula that's just one bare
// variable with no operator around it — verified empirically against the
// installed library) and must never collide with a real, 1-based cell row.
const VARIABLE_ROW = -1

// Evaluates a formula written in terms of NAMED variables rather than
// A1-style cell references — e.g. "total_sales + total_imported" — via
// fast-formula-parser's own `onVariable` "defined name" hook, not a textual
// substitution hack. No real matrix backs this: each variable's value is
// served from the synthetic `VARIABLE_ROW` that no real cell reference can
// ever address, so a stray `A1`-shaped token in the formula correctly falls
// through to `#REF!` rather than silently resolving to a variable.
//
// Alias-naming constraints (inherited from the library's own grammar, not
// enforced here — verified empirically): an alias must lex as a `Name`
// token, which loses to a `Column`/`Cell` token match of EQUAL length. In
// practice this means a 1-3 letter, all-alphabetic alias (`a`, `qty`) is
// read as a spreadsheet column reference, not a variable — a longer alias, or
// one containing a digit/underscore (`total_sales`, `qty1`), is unambiguous.
// An alias also must not look like a full cell address (`A1`, `B12`) and must
// not be `TRUE`/`FALSE` (reserved boolean literals) — see docs/computed-fields.md.
export async function evaluateFormulaWithVariables(
  variables: Record<string, CellValue>,
  expression: string,
): Promise<CellValue> {
  const names = Object.keys(variables)
  return evaluateWithHooks(expression, {
    onVariable: (name) => {
      const i = names.indexOf(name)
      // Unknown name -> null -> the library itself reports #NAME?, for free.
      return i === -1 ? null : { row: VARIABLE_ROW, col: i + 1 }
    },
    onCell: (ref) => {
      if (ref.row === VARIABLE_ROW) return variables[names[ref.col - 1]] ?? null
      // A real A1-style cell reference: nothing backs it in a variables-only formula.
      throw new FormulaError('REF')
    },
    onRange: () => {
      // Ranges over named scalars aren't meaningful here.
      throw new FormulaError('REF')
    },
  })
}

const CODE_TO_STRING: Record<FormulaErrorCode, string> = {
  REF: '#REF!',
  VALUE: '#VALUE!',
  DIV0: '#DIV/0!',
  NAME: '#NAME?',
  ERROR: '#ERROR!',
  NA: '#N/A',
  NUM: '#NUM!',
  NULL: '#NULL!',
}

// Maps whatever evaluateExpression threw onto the Excel-style string shown in
// the UI — the library's own FormulaError code when available, otherwise the
// generic ERROR fallback.
export function describeFormulaError(err: unknown): string {
  const code = err instanceof FormulaError ? err.code : 'ERROR'
  return CODE_TO_STRING[code]
}

// The public entry point. Never throws — each {id, label, expression} entry
// is evaluated independently (its own try/catch) so one bad formula can't
// blank the others, matching the hand-rolled engine's own contract.
export async function evaluateExpressions(matrix: Matrix, config: FormulaConfigEntry[]): Promise<FormulaResult[]> {
  // A sheet that parsed to zero rows can't have meant any of these formulas —
  // every reference would be out-of-bounds anyway, but SUM/AVERAGE etc. over
  // an empty range would otherwise produce a confident-looking 0 instead of
  // an error.
  if (matrix.length === 0) {
    return config.map((entry) => ({
      id: typeof entry?.id === 'string' ? entry.id : '(unknown)',
      label: entry?.label ?? '(unknown)',
      value: null,
      error: CODE_TO_STRING.ERROR,
    }))
  }

  return Promise.all(
    config.map(async (entry) => {
      try {
        if (
          !entry ||
          typeof entry.label !== 'string' ||
          typeof entry.expression !== 'string' ||
          typeof entry.id !== 'string'
        ) {
          throw new FormulaError('ERROR')
        }
        return { id: entry.id, label: entry.label, value: await evaluateExpression(matrix, entry.expression) }
      } catch (err) {
        return {
          id: typeof entry?.id === 'string' ? entry.id : '(unknown)',
          label: entry?.label ?? '(unknown)',
          value: null,
          error: describeFormulaError(err),
        }
      }
    }),
  )
}
