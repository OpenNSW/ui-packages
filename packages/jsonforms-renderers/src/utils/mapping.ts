import { Resolve } from '@jsonforms/core'
import { evaluateFormulaWithVariables, describeFormulaError, type CellValue } from './spreadsheet'

// Maps values out of a parsed document onto form-data paths — the read half of
// an importer. Writing is the caller's job, so everything here stays pure and
// testable without a JsonForms tree.
//
// A document an importer parses almost never matches the shape a form wants: a
// date arrives as 7/23/26, an enum as the number 1, an identifier split across
// four elements. Rather than a transform language, each entry declares the one
// or two conversions it needs, and anything genuinely expression-shaped reuses
// evaluateFormulaWithVariables — the evaluator x-computed already uses.

export interface WriteToEntry {
  /**
   * Target path, dot-joined — `blendsheet_data.0.blendsheet_no` for an
   * importer (the representation handleChange/update consume, see
   * @jsonforms/core's toDataPath), or `Party.Name` for an exporter (nested
   * keys in the object buildFromWrites assembles). Not the JSON Pointer a
   * uischema `scope` uses, either way.
   *
   * Resolved verbatim here: this module is form-agnostic and returns whatever
   * `to` says. Whether that is absolute from the form root or relative to the
   * control's own record is the caller's choice, via `writeBase`.
   */
  to: string
  /** Source path within the parsed document. Mutually exclusive with inputs/formula. */
  from?: string
  /** Named source paths for `formula`, resolved the same way `from` is. */
  inputs?: Record<string, string>
  /**
   * Expression over `inputs`, for values the document splits across elements.
   * Aliases must not be 1-3 letters and all-alphabetic — the grammar reads
   * those as spreadsheet column references. See docs/computed-fields.md.
   */
  formula?: string
  /** Coercion applied after `map`. */
  as?: 'string' | 'number' | 'boolean' | 'date'
  /** dayjs parse format, `as: 'date'` only — e.g. 'M/D/YY'. */
  format?: string
  /** Substitutes matching values. A value with no entry passes through unchanged. */
  map?: Record<string, CellValue>
  /** Used when the source is absent. Without one, an absent source writes nothing. */
  default?: CellValue
  /**
   * When `from` resolves to a repeating element, these entries are resolved
   * per repetition (each against that one element) and assembled into one
   * object per repetition via `buildFromWrites`, collected into `to` as an
   * array. Omitted — the default — keeps the repeated element's raw rows,
   * unchanged, as `to`'s value.
   */
  writeTo?: WriteToEntry[]
}

export interface ResolvedWrite {
  to: string
  /** Form data, so a row array as readily as a scalar — not just a cell value. */
  value: unknown
}

// A tagged result rather than a sentinel value: `unknown | typeof SENTINEL`
// collapses straight back to `unknown`, so the union would neither narrow nor
// mean anything. This also keeps `undefined` and `null` usable as real values.
type Resolved = { found: false } | { found: true; value: unknown }
const ABSENT: Resolved = { found: false }
const found = (value: unknown): Resolved => ({ found: true, value })

// What counts as "nothing here", which is what `default` fills in for.
//
// An ARRAY is present, and deliberately so: a repeated element is a table's
// rows, and writing those into a sheet field is the main thing an importer
// does. Only a non-array object is absent — and that case is not defensive.
// `<discount><null/></discount>` parses to { null: '' }, so a document's way
// of spelling "empty" arrives as an OBJECT. Letting it through would put an
// object into a number field, where AJV rejects it with a type error the form
// author cannot act on.
function present(value: unknown): Resolved {
  if (value === null || value === undefined || value === '') return ABSENT
  if (Array.isArray(value)) return found(value)
  if (value instanceof Date) return found(value)
  if (typeof value === 'object') return ABSENT
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return found(value)
  return ABSENT
}

const TRUE = new Set(['true', '1', 'yes', 'y'])
const FALSE = new Set(['false', '0', 'no', 'n'])

async function coerce(value: unknown, entry: WriteToEntry): Promise<Resolved> {
  switch (entry.as) {
    case undefined:
      return found(value)
    case 'string':
      return found(value instanceof Date ? value.toISOString() : String(value))
    case 'number': {
      const n = value instanceof Date ? value.getTime() : Number(value)
      return Number.isFinite(n) ? found(n) : ABSENT
    }
    case 'boolean': {
      const k = String(value).trim().toLowerCase()
      if (TRUE.has(k)) return found(true)
      if (FALSE.has(k)) return found(false)
      return ABSENT
    }
    case 'date': {
      // dayjs rather than a formula: the allowlist has no TEXT, VALUE or
      // DATEVALUE, and a 2-digit year is ambiguous without an explicit format.
      const { default: dayjs } = await import('dayjs')
      const { default: customParseFormat } = await import('dayjs/plugin/customParseFormat.js')
      dayjs.extend(customParseFormat)
      const raw = value instanceof Date ? value.toISOString() : String(value)
      // strict, so a format that doesn't match is reported as absent rather
      // than silently guessed into some other date.
      const parsed = entry.format ? dayjs(raw, entry.format, true) : dayjs(raw)
      return parsed.isValid() ? found(parsed.format('YYYY-MM-DD')) : ABSENT
    }
  }
}

async function resolveOne(document: unknown, entry: WriteToEntry): Promise<Resolved> {
  if (entry.formula !== undefined) {
    const variables: Record<string, CellValue> = {}
    for (const [alias, path] of Object.entries(entry.inputs ?? {})) {
      const input = present(Resolve.data(document, path))
      // One missing input makes the whole expression meaningless, so the entry
      // falls back rather than composing a value with a hole in it.
      if (!input.found || Array.isArray(input.value)) return ABSENT
      variables[alias] = input.value as CellValue
    }
    try {
      return found(await evaluateFormulaWithVariables(variables, entry.formula))
    } catch (err) {
      throw new Error(`writeTo "${entry.to}": ${describeFormulaError(err)}`)
    }
  }
  if (entry.from === undefined) throw new Error(`writeTo "${entry.to}" needs either "from" or "formula".`)
  return present(Resolve.data(document, entry.from))
}

// The write half of an exporter: assembles resolved writes into one plain
// object, `to`'s dot-joined segments becoming nested keys — the mirror image
// of an importer's writes, which land on form-data paths via handleChange
// instead of an in-memory object built up here. Later entries win on a
// collision, the same left-to-right precedence resolveWrites/coerce already
// give the entries array elsewhere.
export function buildFromWrites(writes: ResolvedWrite[]): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const { to, value } of writes) {
    const segments = to.split('.').filter(Boolean)
    if (segments.length === 0) continue
    let cursor = root
    for (const segment of segments.slice(0, -1)) {
      const next = cursor[segment]
      if (next && typeof next === 'object' && !Array.isArray(next)) {
        cursor = next as Record<string, unknown>
      } else {
        const created: Record<string, unknown> = {}
        cursor[segment] = created
        cursor = created
      }
    }
    cursor[segments[segments.length - 1]] = value
  }
  return root
}

// Document in, writes out. Entries whose source is absent and which declare no
// default are skipped entirely rather than written as undefined: an importer
// fills in what its document actually carries, and clearing a field the
// document says nothing about is not the same thing.
export async function resolveWrites(document: unknown, entries: WriteToEntry[]): Promise<ResolvedWrite[]> {
  const writes: ResolvedWrite[] = []
  for (const entry of entries) {
    let result = await resolveOne(document, entry)
    // `map` and `as` are scalar conversions. Rows go through untouched —
    // String()-ing an array of records would be meaningless, not useful.
    const rows = result.found && Array.isArray(result.value)
    if (result.found && rows && entry.writeTo) {
      const built = await Promise.all(
        (result.value as unknown[]).map(async (element) =>
          buildFromWrites(await resolveWrites(element, entry.writeTo!)),
        ),
      )
      writes.push({ to: entry.to, value: built })
      continue
    }
    // A nested `writeTo` only makes sense once `from` is actually repeating.
    // Silently falling through to the scalar path would leave a mistyped
    // `from`/`arrayPaths` writing an unreshaped value with no signal at all.
    if (result.found && !rows && entry.writeTo) {
      throw new Error(`writeTo "${entry.to}": "writeTo" is set, but "from" did not resolve to a repeating element.`)
    }
    if (result.found && !rows && entry.map) {
      const key = result.value instanceof Date ? result.value.toISOString() : String(result.value)
      if (Object.prototype.hasOwnProperty.call(entry.map, key)) result = found(entry.map[key])
    }
    if (result.found && !rows) result = await coerce(result.value, entry)
    if (!result.found) {
      if (entry.default === undefined) continue
      writes.push({ to: entry.to, value: entry.default })
      continue
    }
    writes.push({ to: entry.to, value: result.value })
  }
  return writes
}
