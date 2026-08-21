import type { FormulaError as LibFormulaErrorClass } from 'fast-formula-parser'
import { FormulaError } from './reference'

// The safety net this rewrite depends on: `fast-formula-parser@1.0.19`
// implements most Excel functions for real, but a real subset are present in
// its function table only as empty-body stubs (dispatched, but they execute
// nothing and return `undefined`). This module enforces an allowlist
// unconditionally, *before* a formula ever reaches the parser — only a name
// verified below (native, or backfilled via `@formulajs/formulajs`) may be
// called at all — rather than relying on the library's current (undocumented,
// version-specific) dispatcher behavior for unimplemented functions. See
// docs/spreadsheet-formulas.md for the supported list and license rationale.
//
// Every name below was verified by reading the installed library's source
// AND by running it through the real parser — not assumed. A few functions
// are backfilled instead of left native despite having a real (non-stub)
// implementation, because that implementation is confirmed broken for this
// app's data (see the comments on DATE_FUNCTIONS_WITH_BROKEN_NATIVE_IMPL,
// LOGICAL_FUNCTIONS_WITH_BROKEN_CONDITION_COERCION, and
// TEXT_FUNCTIONS_BROKEN_FOR_BLANK_CELLS below for what and why).

// ─────────────────────────────────────────────────────────────────────────
// Native — confirmed by reading the installed source to have a real,
// non-stub implementation, AND spot-checked by parsing an actual formula.
// ─────────────────────────────────────────────────────────────────────────
const NATIVE_FUNCTIONS = [
  // Logical
  // IF is excluded here even though its native body is real, non-stub code —
  // see LOGICAL_FUNCTIONS_WITH_BROKEN_CONDITION_COERCION below for why it's
  // backfilled instead.
  'IFS',
  'IFERROR',
  'AND',
  'OR',
  'NOT',
  // Math
  'ROUND',
  'ROUNDUP',
  'ROUNDDOWN',
  // Lookup and reference
  'INDEX',
  'VLOOKUP',
  'HLOOKUP',
  // Statistical
  'SUM',
  'AVERAGE',
  'COUNT',
  // Date — DATE/TODAY only; YEAR/MONTH/DAY/WEEKDAY are backfilled below, see
  // DATE_FUNCTIONS_WITH_BROKEN_NATIVE_IMPL.
  'DATE',
  'TODAY',
] as const

// ─────────────────────────────────────────────────────────────────────────
// Confirmed empty-body stubs in fast-formula-parser (calling them natively
// throws "not implemented" today — see the module comment above for why that
// isn't good enough to rely on) that @formulajs/formulajs implements for
// real, backfilled in formulaFunctions() below.
// ─────────────────────────────────────────────────────────────────────────
const BACKFILLED_STUB_FUNCTIONS = [
  'MAX',
  'MIN',
  'MAXA',
  'MINA',
  'MEDIAN',
  'LARGE',
  'SMALL',
  'PERMUT',
  'PERMUTATIONA',
  'MATCH', // forced to exact-match only — see the MATCH wrapper below.
  'SWITCH', // a stub too, despite being implemented elsewhere in Excel's own function set.
  'SUBSTITUTE',
  'TEXTJOIN',
  'COUNTA', // not present in fast-formula-parser's function table at all.
  'UPPER',
] as const

// ─────────────────────────────────────────────────────────────────────────
// Native, non-stub code exists but is confirmed broken for this app's data:
// a real spreadsheet date cell is a JS `Date` (parse.ts uses `cellDates:
// true`), and fast-formula-parser's own date functions can't see a `Date`
// through their normal argument-wrapping — `YEAR(<a Date cell>)` reliably
// returns `#VALUE!` against the installed library. formulajs's own date
// functions handle a plain `Date` correctly, so these are backfilled instead.
// ─────────────────────────────────────────────────────────────────────────
const DATE_FUNCTIONS_WITH_BROKEN_NATIVE_IMPL = ['YEAR', 'MONTH', 'DAY', 'WEEKDAY'] as const

// ─────────────────────────────────────────────────────────────────────────
// Native, non-stub IF exists, but its condition argument is confirmed to
// mis-coerce: a non-empty string truthy-coerces instead of erroring
// (`IF("abc",1,2)` => 1), and a bare cell/range reference is never actually
// dereferenced (`IF(A1,1,2)` => 1 regardless of A1's value) — both because IF
// is one of fast-formula-parser's own hardcoded functions whose arguments
// skip the library's normal reference-retrieval step. Backfilled below with
// a minimal reimplementation that fixes both, without touching the one part
// of native IF that already works: a bare reference used as a *branch* (not
// the condition) stays unretrieved, which is what makes
// `IF(FALSE, B100, 99)` -> 99 a genuine short-circuit — see
// docs/spreadsheet-formulas.md for how much further that guarantee extends.
// ─────────────────────────────────────────────────────────────────────────
const LOGICAL_FUNCTIONS_WITH_BROKEN_CONDITION_COERCION = ['IF'] as const

// ─────────────────────────────────────────────────────────────────────────
// Native, non-stub code exists but silently mishandles a bare blank cell
// passed as a scalar argument — it leaks the library's own internal
// argument-wrapper object into the function body instead of treating the
// cell as empty text (e.g. `LEN(<a blank cell>)` returns a plausible-looking
// but wrong number). Backfilled via formulajs, unwrapped through this file's
// own null-safe helpers instead of the library's buggy one.
// ─────────────────────────────────────────────────────────────────────────
const TEXT_FUNCTIONS_BROKEN_FOR_BLANK_CELLS = [
  'CONCATENATE',
  'CONCAT',
  'LEN',
  'TRIM',
  'LOWER',
  'LEFT',
  'RIGHT',
  'MID',
  'FIND',
  'SEARCH',
] as const

// MAXIFS/MINIFS/AVERAGEIFS are deliberately not backfilled — see
// docs/spreadsheet-formulas.md. Everything else fast-formula-parser
// implements (trigonometry, financial, engineering, and the rest) is
// intentionally not allowlisted: this is an allowlist, not a blocklist, and a
// function this package hasn't read, tested, and vetted stays unreachable.

export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  ...NATIVE_FUNCTIONS,
  ...BACKFILLED_STUB_FUNCTIONS,
  ...DATE_FUNCTIONS_WITH_BROKEN_NATIVE_IMPL,
  ...TEXT_FUNCTIONS_BROKEN_FOR_BLANK_CELLS,
  ...LOGICAL_FUNCTIONS_WITH_BROKEN_CONDITION_COERCION,
])

// Same double-quote-escape-aware string literal matcher used historically in
// this codebase's hand-rolled tokenizer — a function-shaped substring that
// only appears *inside* a string literal (e.g. the text `"SUM("` as data, not
// code) must never be scanned as a call.
const STRING_LITERAL_RE = /"(?:[^"]|"")*"/g

// Matches an identifier immediately followed by `(` — the shape a function
// call takes in this grammar, mirroring how call-shaped tokens are already
// recognized elsewhere in this codebase. The negative lookbehind keeps a
// match from starting inside a bigger identifier (so this can't fire on the
// tail of a longer name); the identifier body allows a dot, matching Excel's
// own naming convention for names like `CEILING.MATH` even though none of
// those are on the allowlist today.
const FUNCTION_CALL_RE = /(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g

// Scans `expression` for every function-call-shaped token and throws a
// `FormulaError('NAME')` — the same shape Excel's own `#NAME?` takes — for
// the first one not on the allowlist. Must run before `expression` ever
// reaches the parser (see expression.ts): that ordering is what guarantees a
// disallowed name can never reach fast-formula-parser at all, regardless of
// whether the library itself would have handled it safely.
export function assertAllowedFunctions(expression: string): void {
  const withoutStringLiterals = expression.replace(STRING_LITERAL_RE, (literal) => ' '.repeat(literal.length))

  FUNCTION_CALL_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FUNCTION_CALL_RE.exec(withoutStringLiterals)) !== null) {
    const name = match[1].toUpperCase()
    if (!ALLOWED_FUNCTIONS.has(name)) {
      throw new FormulaError('NAME', `Function ${name} is not allowed.`)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Backfill implementations
// ─────────────────────────────────────────────────────────────────────────

// The surface of @formulajs/formulajs this module actually calls. formulajs
// ships real type declarations, but they're all `any`-typed; this narrows to
// exactly the shapes used below so a wrong argument order fails to compile.
type FormulaJs = {
  MAX(...values: unknown[]): unknown
  MIN(...values: unknown[]): unknown
  MAXA(...values: unknown[]): unknown
  MINA(...values: unknown[]): unknown
  MEDIAN(...values: unknown[]): unknown
  LARGE(array: unknown[], k: unknown): unknown
  SMALL(array: unknown[], k: unknown): unknown
  PERMUT(number: unknown, numberChosen: unknown): unknown
  PERMUTATIONA(number: unknown, numberChosen: unknown): unknown
  MATCH(lookupValue: unknown, lookupArray: unknown[], matchType: unknown): unknown
  SWITCH(...values: unknown[]): unknown
  SUBSTITUTE(...values: unknown[]): unknown
  TEXTJOIN(delimiter: unknown, ignoreEmpty: unknown, items: unknown[]): unknown
  COUNTA(...values: unknown[]): unknown
  UPPER(text: unknown): unknown
  YEAR(date: unknown): unknown
  MONTH(date: unknown): unknown
  DAY(date: unknown): unknown
  WEEKDAY(date: unknown, returnType?: unknown): unknown
  CONCATENATE(...values: unknown[]): unknown
  CONCAT(...values: unknown[]): unknown
  LEN(text: unknown): unknown
  TRIM(text: unknown): unknown
  LOWER(text: unknown): unknown
  LEFT(text: unknown, numChars?: unknown): unknown
  RIGHT(text: unknown, numChars?: unknown): unknown
  MID(text: unknown, startNum: unknown, numChars: unknown): unknown
  FIND(findText: unknown, withinText: unknown, startNum?: unknown): unknown
  SEARCH(findText: unknown, withinText: unknown, startNum?: unknown): unknown
}

type LibFormulaErrorCtor = typeof LibFormulaErrorClass

// `retrieveRef` is how the library turns a lazy `{ref: {...}}` reference
// descriptor into a real value — IF's backfill needs to call it directly
// since IF's arguments arrive unretrieved (see the comment above
// LOGICAL_FUNCTIONS_WITH_BROKEN_CONDITION_COERCION). The real FormulaParser
// instance is passed to IF as `context` for exactly this reason.
type FormulaParserContext = { retrieveRef(ref: unknown): unknown }

// Resolves IF's condition to a genuine boolean, fixing both defects
// documented above LOGICAL_FUNCTIONS_WITH_BROKEN_CONDITION_COERCION: a bare
// reference is dereferenced, and only a real boolean or number is accepted —
// a string throws `#VALUE!` regardless of its content.
function coerceIfCondition(raw: unknown, context: FormulaParserContext, LibFormulaError: LibFormulaErrorCtor): boolean {
  let value = raw
  if (value == null) throw LibFormulaError.NA // IF() with no condition -> #N/A, matching native.
  if (typeof value === 'object' && !(value instanceof LibFormulaError)) {
    value = context.retrieveRef(value)
  }
  if (value instanceof LibFormulaError) throw value
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  throw LibFormulaError.VALUE
}

// A value fast-formula-parser hands a custom function arrives wrapped as
// `{ value, isArray, isRangeRef, isCellRef }` (see grammar/hooks.js's
// `_callFunction`, which applies this to every function, built-in or
// custom) — this unwraps that shape. Guards for `arg` not being an object at
// all too, since a handful of call sites here pass an already-raw value.
function rawValue(arg: unknown): unknown {
  if (arg !== null && typeof arg === 'object' && 'value' in (arg as Record<string, unknown>)) {
    return (arg as { value: unknown }).value
  }
  return arg
}

// Flattens one argument — a bare scalar, or a pooled range/array — into a
// flat list of raw values. Mirrors the hand-rolled engine's own
// flattenValues: SUM/MAX/etc. pool every argument together regardless of
// whether it came from a single cell or a whole range.
function flattenArg(arg: unknown): unknown[] {
  const value = rawValue(arg)
  return Array.isArray(value) ? (value as unknown[]).flat(Infinity) : [value]
}

function scalarArg(arg: unknown): unknown {
  const value = rawValue(arg)
  return Array.isArray(value) ? (value as unknown[]).flat(Infinity)[0] : value
}

// Same as scalarArg, but for a genuinely-omitted trailing optional argument
// (e.g. `LEFT(text)` called with no `num_chars`) — `arg` itself is plain JS
// `undefined` in that case (the dispatcher only supplies as many positional
// arguments as the formula text actually wrote), not a wrapped object, so
// scalarArg's own `rawValue` unwrap doesn't apply. formulajs's own functions
// already apply Excel's own default for a genuinely-`undefined` argument
// (e.g. `LEFT`'s default `num_chars` of 1), so this only needs to avoid
// calling `scalarArg` on something that isn't a wrapped argument at all.
function optionalScalarArg(arg: unknown): unknown {
  return arg === undefined ? undefined : scalarArg(arg)
}

// Display-string coercion for the text-function backfills, matching the rest
// of this package's convention (Excel's own TRUE/FALSE display, not JS's
// lowercase; a Date renders the same way SpreadsheetControl.tsx's formatCell
// shows it).
function toText(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

// formulajs signals its own errors by returning a plain `Error` sentinel
// (e.g. `new Error('#N/A')`) rather than throwing fast-formula-parser's own
// `FormulaError` class — normalizing to that class here keeps it propagating
// the same way every native error already does.
function toLibraryError(result: Error, LibFormulaError: LibFormulaErrorCtor): InstanceType<LibFormulaErrorCtor> {
  if (result instanceof LibFormulaError) return result
  return new LibFormulaError(result.message || '#ERROR!')
}

function findError(values: unknown[]): Error | undefined {
  return values.find((value): value is Error => value instanceof Error)
}

// Builds the `functions` map passed to `new FormulaParser({ functions: ... })`
// — merged in *after* fast-formula-parser's own built-ins, so every name here
// silently overrides the native (stub, absent, or, for the date functions,
// broken) implementation of the same name.
export function backfilledFunctions(
  fj: FormulaJs,
  LibFormulaError: LibFormulaErrorCtor,
): Record<string, (...args: unknown[]) => unknown> {
  const raise = (error: Error): never => {
    throw toLibraryError(error, LibFormulaError)
  }

  // Shared shape for every aggregate that pools all of its arguments into one
  // flat list (MAX/MIN/MAXA/MINA/MEDIAN/COUNTA): unwrap + flatten every
  // argument, propagate the first error found among them (matching
  // formulajs's own `anyError` convention used internally by these
  // functions), then hand the flat list to formulajs and propagate an
  // error-shaped result the same way.
  const pooledAggregate =
    (fjFn: (...values: unknown[]) => unknown, { checkArgsForErrors = true }: { checkArgsForErrors?: boolean } = {}) =>
    (...args: unknown[]) => {
      const values = args.flatMap(flattenArg)
      if (checkArgsForErrors) {
        const err = findError(values)
        if (err) raise(err)
      }
      const result = fjFn(...values)
      return result instanceof Error ? raise(result) : result
    }

  // Shared shape for every single-scalar-argument backfill that doesn't need
  // its own bespoke handling (UPPER/YEAR/MONTH/DAY/LEN/TRIM/LOWER): unwrap the
  // one argument, propagate an error found on it, hand the value — optionally
  // run through this file's null-safe toText() first, for the text functions
  // that must treat a blank cell as empty text — to formulajs, then propagate
  // an error-shaped result the same way. LEFT/RIGHT/MID/FIND/SEARCH stay
  // bespoke (optional trailing args), as does WEEKDAY (optional returnType).
  const unaryScalar =
    (fjFn: (value: unknown) => unknown, { toText: coerceToText = false }: { toText?: boolean } = {}) =>
    (arg: unknown) => {
      const value = scalarArg(arg)
      const err = findError([value])
      if (err) raise(err)
      const result = fjFn(coerceToText ? toText(value) : value)
      return result instanceof Error ? raise(result) : result
    }

  return {
    // valueIfTrue/valueIfFalse are passed through unretrieved (not
    // dereferenced or type-checked here) — that's what makes
    // `IF(FALSE, B100, 99)` a genuine short-circuit rather than a lookup.
    IF: (context, logicalTest, valueIfTrue, valueIfFalse) => {
      const cond = coerceIfCondition(logicalTest, context as FormulaParserContext, LibFormulaError)
      if (valueIfTrue == null) throw LibFormulaError.NA
      return cond ? valueIfTrue : (valueIfFalse ?? false)
    },

    // Empty input -> 0, matching both the hand-rolled engine this replaces
    // and formulajs's own convention for MAX/MIN.
    MAX: pooledAggregate(fj.MAX),
    MIN: pooledAggregate(fj.MIN),
    MAXA: pooledAggregate(fj.MAXA),
    MINA: pooledAggregate(fj.MINA),
    MEDIAN: pooledAggregate(fj.MEDIAN),
    // COUNTA counts non-blank entries; an error value among the args is
    // itself non-blank and gets counted (matching formulajs's own COUNTA,
    // which never checks for errors), so this skips the error propagation
    // the other aggregates use.
    COUNTA: pooledAggregate(fj.COUNTA, { checkArgsForErrors: false }),

    LARGE: (array, k) => {
      const values = flattenArg(array)
      const kValue = scalarArg(k)
      const err = findError([...values, kValue])
      if (err) raise(err)
      const result = fj.LARGE(values, kValue)
      return result instanceof Error ? raise(result) : result
    },
    SMALL: (array, k) => {
      const values = flattenArg(array)
      const kValue = scalarArg(k)
      const err = findError([...values, kValue])
      if (err) raise(err)
      const result = fj.SMALL(values, kValue)
      return result instanceof Error ? raise(result) : result
    },

    PERMUT: (number, numberChosen) => {
      const args = [scalarArg(number), scalarArg(numberChosen)]
      const err = findError(args)
      if (err) raise(err)
      const result = fj.PERMUT(args[0], args[1])
      return result instanceof Error ? raise(result) : result
    },
    PERMUTATIONA: (number, numberChosen) => {
      const args = [scalarArg(number), scalarArg(numberChosen)]
      const err = findError(args)
      if (err) raise(err)
      const result = fj.PERMUTATIONA(args[0], args[1])
      return result instanceof Error ? raise(result) : result
    },

    // match_type is intentionally ignored and forced to 0 (exact match)
    // regardless of what the formula author supplied — approximate/sorted
    // matching (formulajs's own default when the argument is omitted, and
    // Excel's own default too) risks silently mis-ranking unsorted
    // real-world data. Same scope decision as the hand-rolled engine this
    // replaces, carried forward deliberately rather than dropped.
    MATCH: (lookupValue, lookupArray) => {
      const lookup = scalarArg(lookupValue)
      const array = flattenArg(lookupArray)
      const err = findError([lookup, ...array])
      if (err) raise(err)
      const result = fj.MATCH(lookup, array, 0)
      return result instanceof Error ? raise(result) : result
    },

    SWITCH: (...args) => {
      const values = args.map(scalarArg)
      const err = findError(values)
      if (err) raise(err)
      const result = fj.SWITCH(...values)
      return result instanceof Error ? raise(result) : result
    },

    SUBSTITUTE: (text, oldText, newText, instanceNum) => {
      const args: unknown[] = [toText(scalarArg(text)), toText(scalarArg(oldText)), toText(scalarArg(newText))]
      if (instanceNum !== undefined) args.push(scalarArg(instanceNum))
      const err = findError(args)
      if (err) raise(err)
      const result = fj.SUBSTITUTE(...args)
      return result instanceof Error ? raise(result) : result
    },
    TEXTJOIN: (delimiter, ignoreEmpty, ...rest) => {
      const delim = toText(scalarArg(delimiter))
      const ignore = scalarArg(ignoreEmpty)
      const items = rest.flatMap(flattenArg).map(toText)
      const err = findError([delim, ignore])
      if (err) raise(err)
      const result = fj.TEXTJOIN(delim, ignore, items)
      return result instanceof Error ? raise(result) : result
    },
    UPPER: unaryScalar(fj.UPPER),

    // See DATE_FUNCTIONS_WITH_BROKEN_NATIVE_IMPL above for why these override
    // fast-formula-parser's own (real, but broken-for-Date-cells) versions.
    YEAR: unaryScalar(fj.YEAR),
    MONTH: unaryScalar(fj.MONTH),
    DAY: unaryScalar(fj.DAY),
    WEEKDAY: (date, returnType) => {
      const value = scalarArg(date)
      const type = scalarArg(returnType)
      const err = findError([value])
      if (err) raise(err)
      const result = fj.WEEKDAY(value, type)
      return result instanceof Error ? raise(result) : result
    },

    // See TEXT_FUNCTIONS_BROKEN_FOR_BLANK_CELLS above: these override fast-
    // formula-parser's own (real, but broken-for-a-bare-blank-cell) versions.
    // Every text argument goes through this file's own null-safe toText()
    // rather than the library's own buggy coercer, so a blank cell reads as
    // empty text here the same way it always has for SUM/AVERAGE/COUNT.
    //
    // Flattens every argument (a whole range included) and joins with no
    // separator, matching Excel's own range-argument behavior — the native
    // implementation instead inserts stray commas for a whole-range argument.
    CONCATENATE: (...args) => {
      const values = args.flatMap(flattenArg)
      const err = findError(values)
      if (err) raise(err)
      const result = fj.CONCATENATE(...values.map(toText))
      return result instanceof Error ? raise(result) : result
    },
    CONCAT: (...args) => {
      const values = args.flatMap(flattenArg)
      const err = findError(values)
      if (err) raise(err)
      const result = fj.CONCAT(...values.map(toText))
      return result instanceof Error ? raise(result) : result
    },
    LEN: unaryScalar(fj.LEN, { toText: true }),
    TRIM: unaryScalar(fj.TRIM, { toText: true }),
    LOWER: unaryScalar(fj.LOWER, { toText: true }),
    LEFT: (text, numChars) => {
      const value = scalarArg(text)
      const chars = optionalScalarArg(numChars)
      const err = findError([value])
      if (err) raise(err)
      const result = fj.LEFT(toText(value), chars)
      return result instanceof Error ? raise(result) : result
    },
    RIGHT: (text, numChars) => {
      const value = scalarArg(text)
      const chars = optionalScalarArg(numChars)
      const err = findError([value])
      if (err) raise(err)
      const result = fj.RIGHT(toText(value), chars)
      return result instanceof Error ? raise(result) : result
    },
    MID: (text, startNum, numChars) => {
      const value = scalarArg(text)
      const start = scalarArg(startNum)
      const chars = scalarArg(numChars)
      const err = findError([value, start, chars])
      if (err) raise(err)
      const result = fj.MID(toText(value), start, chars)
      return result instanceof Error ? raise(result) : result
    },
    FIND: (findText, withinText, startNum) => {
      const needle = scalarArg(findText)
      const haystack = scalarArg(withinText)
      const start = optionalScalarArg(startNum)
      const err = findError([needle, haystack])
      if (err) raise(err)
      const result = fj.FIND(toText(needle), toText(haystack), start)
      return result instanceof Error ? raise(result) : result
    },
    SEARCH: (findText, withinText, startNum) => {
      const needle = scalarArg(findText)
      const haystack = scalarArg(withinText)
      const start = optionalScalarArg(startNum)
      const err = findError([needle, haystack])
      if (err) raise(err)
      const result = fj.SEARCH(toText(needle), toText(haystack), start)
      return result instanceof Error ? raise(result) : result
    },
  }
}
