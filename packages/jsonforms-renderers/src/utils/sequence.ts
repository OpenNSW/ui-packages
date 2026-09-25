import { Resolve } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'
import { parseTemplate, renderTemplate } from './template'
import type { ComputedInput } from './computed'

/**
 * `x-template` on a property inside an array's `items` numbers that array's
 * rows as they are added, rather than asking the user to type a reference:
 *
 * ```json
 * "lineRef": {
 *   "type": "string",
 *   "readOnly": true,
 *   "x-template": {
 *     "template": "{orderNo}-{orderDate}-{seq}",
 *     "inputs": { "orderNo": "orderNo", "orderDate": "orderDate" },
 *     "padding": 2
 *   }
 * }
 * ```
 *
 * which gives ORD-77-2026-05-04-01, -02, -03 as rows are added.
 *
 * Substitution is utils/template.ts's, shared with `x-computed`'s `format`,
 * so its `{name(arg)}` calls work here too — `{today(YYYYMMDD)}`. This module
 * adds only what numbering needs: where a placeholder's value comes from, and
 * a count that outlives the row it numbered.
 *
 * `{seq}` is what makes a template this module's. One without it is not
 * stamped, because there would be nothing to remember and no reason to freeze
 * the value at the moment the row was added — that is a rendering concern,
 * and no control implements it yet.
 *
 * Pair it with `readOnly: true`. The keyword says where the value comes from,
 * not whether it can be edited — the same split ComputedControl makes.
 */
interface TemplateSpec {
  /** e.g. "{orderNo}-{orderDate}-{seq}". */
  template: string
  /**
   * alias -> path (shorthand) or { path, default }, resolved the way
   * x-computed's inputs are: relative to the containing object, not the root.
   * A placeholder with no entry here resolves as a path of its own name, so
   * `inputs` is only needed to alias a deep path or to give it a default.
   */
  inputs?: Record<string, ComputedInput>
  /** Digits to pad `{seq}` to. Default 2. */
  padding?: number
}

/**
 * The highest number handed out per numbered field, keyed by field name.
 *
 * It has to outlive the rows themselves. Numbering from a row's position, or
 * from the highest number still present, hands a deleted row's number to the
 * next row added — so two rows that existed at different times can go out
 * under one number. Hold this for as long as the array is on screen.
 *
 * KNOWN GAP — it does not outlive the array's own mount. ArrayControl holds
 * this in a ref, so anything that unmounts the control starts it empty again;
 * CategorizationLayoutRenderer does exactly that, since its Radix Tabs.Content
 * carries no `forceMount` and both ship in the same `radixRenderers` export.
 * Switching tabs away and back therefore forgets what was issued.
 *
 * What survives that is the reconciliation in stampSequences below: an empty
 * counter falls back to the numbers the rows themselves carry, so numbering
 * continues from the visible maximum rather than restarting at one. What is
 * lost is only the no-reuse guarantee across a remount — delete the
 * highest-numbered row, switch tabs, come back, add a row, and that number is
 * issued a second time. Persisting the counter with the form's data would
 * close it; nothing does today.
 */
export type SequenceCounters = Record<string, number>

/** The one placeholder this module answers itself. */
const SEQ = 'seq'
const DEFAULT_PADDING = 2

const isBlank = (value: unknown): boolean => value === undefined || value === null || value === ''

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

/** Reads a usable `x-template` off a property schema, or undefined. */
const templateSpec = (schema: unknown): TemplateSpec | undefined => {
  // typeof null === 'object', and a template is what makes the keyword usable
  const spec = (schema as Record<string, unknown> | undefined)?.['x-template']
  if (typeof spec !== 'object' || spec === null) return undefined
  const { template, inputs, padding } = spec as Partial<TemplateSpec>
  if (typeof template !== 'string' || template === '') return undefined
  return { template, inputs, padding }
}

/** True when a part is the bare `{seq}` — not `{seq(…)}`, which is a call. */
const isSeq = (part: ReturnType<typeof parseTemplate>[number]): boolean =>
  typeof part !== 'string' && part.name === SEQ && part.arg === undefined

/**
 * The names a template reads out of the FORM — so not `{seq}`, and not a
 * `{name(arg)}` call, which utils/template.ts resolves against its function
 * registry rather than against data. `{today(YYYYMMDD)}` is one of those.
 */
const placeholders = (template: string): string[] => {
  const names = new Set<string>()
  for (const part of parseTemplate(template)) {
    if (typeof part === 'string' || part.arg !== undefined) continue
    if (part.name !== SEQ) names.add(part.name)
  }
  return [...names]
}

/** The numbered `x-template` properties of an array's items schema. */
const numberedFields = (itemsSchema: JsonSchema | undefined): [string, TemplateSpec][] => {
  const found: [string, TemplateSpec][] = []
  for (const [name, property] of Object.entries(itemsSchema?.properties ?? {})) {
    const spec = templateSpec(property)
    if (spec && parseTemplate(spec.template).some(isSeq)) found.push([name, spec])
  }
  return found
}

/**
 * Reads each placeholder out of the form, relative to `parentPath` — the same
 * dot-joined convention, and the same relative-to-the-containing-object rule,
 * as x-computed's inputs (see resolveComputedInputs in utils/computed.ts).
 *
 * A missing value is not fatal, unlike x-computed, where it makes the whole
 * field unavailable: it renders as empty. A template is a label being
 * assembled, so a half-filled form gives a half-filled label — where a
 * formula computing from a missing number would simply be wrong.
 */
const resolveInputs = (rootData: unknown, parentPath: string, spec: TemplateSpec): Record<string, string> => {
  const values: Record<string, string> = {}

  for (const name of placeholders(spec.template)) {
    // No entry in `inputs`: the placeholder is its own path, relative to the
    // same parent an aliased one would be resolved against.
    const config = spec.inputs?.[name] ?? name
    const { path, default: fallback } = typeof config === 'string' ? { path: config, default: undefined } : config
    const resolved = Resolve.data(rootData, parentPath ? `${parentPath}.${path}` : path) as unknown

    const value = isBlank(resolved) ? fallback : resolved
    values[name] = isBlank(value) ? '' : String(value)
  }

  return values
}

/** Fills a spec in for one row, over utils/template.ts's engine. */
const render = (spec: TemplateSpec, values: Record<string, string>, seq: number): string => {
  // Every placeholder starts empty. The engine leaves a name it has no key
  // for standing as written — right for x-computed's display-only format,
  // where a typo should be visible, but wrong here: this value is PERSISTED,
  // and a literal "{orderDate}" stamped into a row is worse than a gap.
  const blanks: Record<string, string> = {}
  for (const name of placeholders(spec.template)) blanks[name] = ''

  return renderTemplate(spec.template, {
    ...blanks,
    ...values,
    // Last, so a form field that happens to be called `seq` cannot take over
    // a row's number.
    [SEQ]: `${seq}`.padStart(spec.padding ?? DEFAULT_PADDING, '0'),
  })
}

/**
 * Matches values this template produced, capturing `{seq}`. Every other
 * placeholder is wildcarded: the fields around the number are free to have
 * changed since a row was numbered, and often have.
 */
const sequencePattern = (template: string): RegExp => {
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  let source = ''
  for (const part of parseTemplate(template)) {
    if (typeof part === 'string') source += escape(part)
    else source += isSeq(part) ? '(\\d+)' : '.*?'
  }
  return new RegExp(`^${source}$`)
}

/**
 * The largest number readable out of the rows already present, so an array
 * reopened with rows in it carries on rather than restarting at one. Anything
 * the template did not produce is ignored.
 */
const highestIssued = (rows: unknown[], field: string, spec: TemplateSpec): number => {
  const pattern = sequencePattern(spec.template)

  let highest = 0
  for (const row of rows) {
    const value = asRecord(row)?.[field]
    if (typeof value !== 'string') continue
    const seq = Number(pattern.exec(value)?.[1])
    if (Number.isFinite(seq) && seq > highest) highest = seq
  }
  return highest
}

/**
 * stampSequences fills in a new row's numbered fields, advancing `counters` as
 * it goes. `counters` is mutated: it is the caller's record of what has
 * already been handed out.
 *
 * `parentPath` is the object a template's inputs resolve against — for an
 * array, the object that CONTAINS it, not the row. A row being numbered does
 * not exist yet, so there is nothing in it to read; what a template reaches
 * for (`{orderNo}`) sits alongside the array instead.
 *
 * A field the new row already carries a value for is left alone, so a caller
 * that supplies its own number keeps it.
 *
 * The number handed out is one past whichever is higher: what `counters` has
 * already issued, or the highest number the existing rows carry.
 */
export const stampSequences = (
  itemsSchema: JsonSchema | undefined,
  newRow: unknown,
  existingRows: unknown[],
  rootData: unknown,
  parentPath: string,
  counters: SequenceCounters,
): unknown => {
  const fields = numberedFields(itemsSchema)
  if (fields.length === 0) return newRow

  const row = asRecord(newRow)
  if (!row) return newRow

  const stamped = { ...row }
  for (const [field, spec] of fields) {
    if (!isBlank(stamped[field])) continue
    // Both, every time: rows can arrive from outside the control — loaded
    // data, an undo, a paste — carrying numbers above anything this counter
    // has handed out, and reading only the counter would duplicate them.
    const issued = Math.max(counters[field] ?? 0, highestIssued(existingRows, field, spec)) + 1
    counters[field] = issued
    stamped[field] = render(spec, resolveInputs(rootData, parentPath, spec), issued)
  }
  return stamped
}
