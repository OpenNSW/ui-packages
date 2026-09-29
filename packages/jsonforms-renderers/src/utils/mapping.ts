import { Resolve } from '@jsonforms/core'
import { formatComputedValue } from './computed'
import { evaluateFormulaWithVariables, describeFormulaError, type CellValue } from './spreadsheet'

// Maps values from one shape onto another, in either direction: out of a parsed
// document onto form-data paths for an importer (XmlControl), or out of form
// data into the document an exporter assembles (XmlExportControl). Writing is
// the caller's job, so everything here stays pure and testable without a
// JsonForms tree.
//
// A document almost never matches the shape a form wants: a date arrives as
// 7/23/26, an enum as the number 1, an identifier split across four elements.
// Rather than a transform language, each entry declares the one or two
// conversions it needs, and anything genuinely expression-shaped reuses
// evaluateFormulaWithVariables — the evaluator x-computed already uses.

// Which way the entries point. `format` means the value's format in the XML
// either way, so it parses on import and formats on export; `@_`/`#text` path
// segments only mean attributes and text in a document being built.
export type WriteDirection = 'import' | 'export'

export interface WriteToEntry {
  /**
   * Target path, dot-joined — `blendsheet_data.0.blendsheet_no` for an
   * importer (the representation handleChange/update consume, see
   * @jsonforms/core's toDataPath), or `Party.Name` for an exporter (nested
   * keys in the object buildFromWrites assembles). Not the JSON Pointer a
   * uischema `scope` uses, either way.
   *
   * On export, a last segment of `@_name` is an attribute of the element
   * before it (of `rootElement` when it is the only segment, of each repeated
   * element inside a nested `writeTo`), and a last segment of `#text` is that
   * element's own text — for an element that carries both. These are the keys
   * the importer's parser produces, so a path read on import writes back as-is.
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
  /**
   * The date's format in the XML, `as: 'date'` only — e.g. 'M/D/YY'. On import
   * it's the strict parse format (the form gets YYYY-MM-DD); on export, the
   * format the form's date is written in. So one format round-trips.
   */
  format?: string
  /**
   * Fixed decimal places for `as: 'number'`, export only — `1` writes 23 as
   * "23.0". The same rounding x-computed's `decimals` uses. On import a
   * string would break a number field, so there it's an error.
   */
  decimals?: number
  /** Substitutes matching values. A value with no entry passes through unchanged. */
  map?: Record<string, CellValue>
  /**
   * Used when the source is absent, and written exactly as given — never
   * mapped or coerced. Without one, an absent source writes nothing. On
   * export an object default writes nested elements: `{ "null": null }` gives
   * `<X><null/></X>`, the way some formats spell "empty".
   */
  default?: unknown
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

// A form's date as a date field stores it (YYYY-MM-DD), or a date-time with an
// offset. Only the date part as written is used, so no time zone can move the
// day.
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/

async function coerce(value: unknown, entry: WriteToEntry, direction: WriteDirection): Promise<Resolved> {
  switch (entry.as) {
    case undefined:
      return found(value)
    case 'string':
      return found(value instanceof Date ? value.toISOString() : String(value))
    case 'number': {
      const n = value instanceof Date ? value.getTime() : Number(value)
      if (!Number.isFinite(n)) return ABSENT
      return found(entry.decimals === undefined ? n : formatComputedValue(n, entry.decimals))
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
      if (direction === 'export') {
        // A Date (a formula's result) is its local day, the way DATE() and
        // TODAY() build one; slicing its ISO string would be the UTC day.
        // Anything that isn't ISO is absent rather than guessed.
        const iso = typeof value === 'string' ? ISO_DATE.exec(value) : null
        const parsed = value instanceof Date ? dayjs(value) : iso ? dayjs(iso[1], 'YYYY-MM-DD', true) : null
        return parsed?.isValid() ? found(parsed.format(entry.format ?? 'YYYY-MM-DD')) : ABSENT
      }
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

// The same keys src/utils/xml/parse.ts gives the importer, so XMLBuilder reads
// them back as attributes and text.
const ATTRIBUTE_PREFIX = '@_'
const TEXT_KEY = '#text'

const segmentsOf = (to: string) => to.split('.').filter(Boolean)
const isMarkup = (segment: string) => segment.startsWith(ATTRIBUTE_PREFIX) || segment === TEXT_KEY

// The rules that hold whatever the data is. XmlExportControl runs this over its
// whole config up front so a mistake shows before anyone clicks; resolveWrites
// runs it on every entry too, so the importer gets the same checks.
export function validateWriteToEntry(entry: WriteToEntry, direction: WriteDirection): string | null {
  // An empty `to` on import is update(''), which replaces the whole form.
  if (typeof entry.to !== 'string' || segmentsOf(entry.to).length === 0) return '"to" must be a non-empty path.'
  if (entry.format !== undefined && entry.as !== 'date') return '"format" needs "as": "date".'
  if (entry.decimals !== undefined) {
    if (direction === 'import')
      return '"decimals" only applies on export — on import it would put text in a number field.'
    if (entry.as !== 'number') return '"decimals" needs "as": "number".'
    const { decimals } = entry
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 100) {
      return '"decimals" must be a whole number from 0 to 100.'
    }
  }
  if (direction === 'export') {
    const segments = segmentsOf(entry.to)
    for (const [i, segment] of segments.entries()) {
      if (segment === ATTRIBUTE_PREFIX) return '"@_" needs an attribute name after it, e.g. "@_id".'
      if (isMarkup(segment) && i < segments.length - 1) {
        return `"${segment}" must be the last segment — it belongs to the element before it.`
      }
    }
  }
  return null
}

// A value can't be written somewhere this build already treats as a parent,
// and nothing can be nested under a value. Either way something is lost.
function collision(to: string, path: string, attributes: boolean): Error {
  const hint = attributes ? ` To give "${path}" both text and attributes, write its text to "${path}.${TEXT_KEY}".` : ''
  return new Error(`writeTo "${to}": "${path}" is written both as a value and as the parent of other values.${hint}`)
}

// The write half of an exporter: assembles resolved writes into one plain
// object, `to`'s dot-joined segments becoming nested keys — the mirror image
// of an importer's writes, which land on form-data paths via handleChange
// instead of an in-memory object built up here. A later write to the same
// leaf wins, the same left-to-right precedence the entries array has
// elsewhere.
//
// Only objects created here are descended into. Anything else already at a
// path is a value — a scalar, rows, or a `default` object that belongs to the
// schema — and writing under it would lose it, or mutate the config it came
// from.
export function buildFromWrites(writes: ResolvedWrite[]): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  const containers = new Set<unknown>([root])
  for (const { to, value } of writes) {
    const segments = segmentsOf(to)
    if (segments.length === 0) continue
    let cursor = root
    for (const [i, segment] of segments.slice(0, -1).entries()) {
      const next = cursor[segment]
      if (next === undefined) {
        const created: Record<string, unknown> = {}
        containers.add(created)
        cursor[segment] = created
        cursor = created
      } else if (containers.has(next)) {
        cursor = next as Record<string, unknown>
      } else {
        throw collision(to, segments.slice(0, i + 1).join('.'), segments[i + 1].startsWith(ATTRIBUTE_PREFIX))
      }
    }
    const leaf = segments[segments.length - 1]
    const existing = cursor[leaf]
    if (containers.has(existing)) {
      const hasAttributes = Object.keys(existing as object).some((key) => key.startsWith(ATTRIBUTE_PREFIX))
      throw collision(to, segments.join('.'), hasAttributes)
    }
    cursor[leaf] = value
  }
  return root
}

const isScalar = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

// Document in, writes out. Entries whose source is absent and which declare no
// default are skipped entirely rather than written as undefined: an importer
// fills in what its document actually carries, and clearing a field the
// document says nothing about is not the same thing.
export async function resolveWrites(
  document: unknown,
  entries: WriteToEntry[],
  direction: WriteDirection,
): Promise<ResolvedWrite[]> {
  const writes: ResolvedWrite[] = []
  for (const entry of entries) {
    const problem = validateWriteToEntry(entry, direction)
    if (problem) throw new Error(`writeTo "${entry.to}": ${problem}`)

    // An attribute or #text holds text. XMLBuilder renders anything else under
    // one as a child element instead (`<#text/>` for a null), so it's checked
    // here, before it gets that far. A null attribute is simply left off.
    const segments = segmentsOf(entry.to)
    const markup = direction === 'export' && isMarkup(segments[segments.length - 1])
    const write = (value: unknown) => {
      if (markup && value == null) return
      if (markup && !isScalar(value)) {
        const hint = value instanceof Date ? ' Add "as": "date" to write a date.' : ''
        throw new Error(
          `writeTo "${entry.to}": an attribute or #text value must be text, a number or a boolean.${hint}`,
        )
      }
      writes.push({ to: entry.to, value })
    }

    let result = await resolveOne(document, entry)
    // `map` and `as` are scalar conversions. Rows go through untouched —
    // String()-ing an array of records would be meaningless, not useful.
    const rows = result.found && Array.isArray(result.value)
    if (result.found && rows && entry.writeTo) {
      const built = await Promise.all(
        (result.value as unknown[]).map(async (element) =>
          buildFromWrites(await resolveWrites(element, entry.writeTo!, direction)),
        ),
      )
      write(built)
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
    if (result.found && !rows) result = await coerce(result.value, entry, direction)
    if (!result.found) {
      if (entry.default === undefined) continue
      write(entry.default)
      continue
    }
    write(result.value)
  }
  return writes
}
