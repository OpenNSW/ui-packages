import type { JsonSchema } from '@jsonforms/core'
import { resolveComputedInput } from './computed'
import type { ComputedInput } from './computed'
import { parseTemplate, renderTemplate } from './template'
import type { TemplateFunction, TemplatePart } from './template'

/**
 * `x-template` on a property inside an array's `items` fills that property in
 * when a row is added, rather than asking the user to type it:
 *
 * ```json
 * "lineRef": {
 *   "type": "string",
 *   "readOnly": true,
 *   "x-template": {
 *     "template": "{orderNo}-{orderDate}-{seq(2)}",
 *     "inputs": { "orderNo": "orderNo", "orderDate": "orderDate" }
 *   }
 * }
 * ```
 *
 * which gives ORD-77-2026-05-04-01, -02, -03 as rows are added.
 *
 * Substitution is utils/template.ts's, shared with `x-computed`'s `format`,
 * so its `{name(arg)}` calls work here too — `{today(YYYYMMDD)}`. This module
 * adds where a placeholder's value comes from, and `{seq(width)}`: the row's
 * number, backed by a count that outlives the row it numbered.
 *
 * Every template is filled once, when its row is added, and not followed
 * afterwards.
 *
 * Pair it with `readOnly: true`. The keyword says where the value comes from,
 * not whether it can be edited — the same split ComputedControl makes.
 */
interface TemplateSpec {
  /** e.g. "{orderNo}-{orderDate}-{seq(2)}". */
  template: string
  /**
   * alias -> path (shorthand) or { path, default }, resolved exactly as
   * x-computed's inputs are: relative to the containing object, not the root.
   * A placeholder with no entry here resolves as a path of its own name, so
   * `inputs` is only needed to alias a deep path or to give it a default.
   */
  inputs?: Record<string, ComputedInput>
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
 * What survives that is the reconciliation in stampRowTemplates below: an empty
 * counter falls back to the numbers the rows themselves carry, so numbering
 * continues from the visible maximum rather than restarting at one. What is
 * lost is only the no-reuse guarantee across a remount — delete the
 * highest-numbered row, switch tabs, come back, add a row, and that number is
 * issued a second time. Persisting the counter with the form's data would
 * close it; nothing does today.
 */
export type SequenceCounters = Record<string, number>

/** The call this module adds to utils/template.ts's registry. */
const SEQ = 'seq'
const DEFAULT_WIDTH = 2

const isBlank = (value: unknown): boolean => value === undefined || value === null || value === ''

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

/** Reads a usable `x-template` off a property schema, or undefined. */
const templateSpec = (schema: unknown): TemplateSpec | undefined => {
  // typeof null === 'object', and a template is what makes the keyword usable
  const spec = (schema as Record<string, unknown> | undefined)?.['x-template']
  if (typeof spec !== 'object' || spec === null) return undefined
  const { template, inputs } = spec as Partial<TemplateSpec>
  if (typeof template !== 'string' || template === '') return undefined
  return { template, inputs }
}

/** True for a `{seq(…)}` call. A bare `{seq}` is a form value like any other. */
const isSeq = (part: TemplatePart | undefined): boolean =>
  typeof part === 'object' && part.name === SEQ && part.arg !== undefined

/**
 * A number can only be read back out of a row when literal text separates it
 * from its neighbours: in `{today(YYYYMMDD)}{seq()}` the digits run together.
 */
const isReadable = (parts: TemplatePart[]): boolean =>
  parts.every((part, i) => !isSeq(part) || (typeof parts[i - 1] !== 'object' && typeof parts[i + 1] !== 'object'))

/**
 * The names a template reads out of the FORM — every bare `{name}`. A
 * `{name(arg)}` call is resolved against utils/template.ts's registry instead.
 */
const placeholders = (template: string): string[] => {
  const names = new Set<string>()
  for (const part of parseTemplate(template)) {
    if (typeof part === 'object' && part.arg === undefined) names.add(part.name)
  }
  return [...names]
}

/** The `x-template` properties of an array's items schema. */
const templateFields = (itemsSchema: JsonSchema | undefined): [string, TemplateSpec][] => {
  const found: [string, TemplateSpec][] = []
  for (const [name, property] of Object.entries(itemsSchema?.properties ?? {})) {
    const spec = templateSpec(property)
    if (spec) found.push([name, spec])
  }
  return found
}

/**
 * Reads each placeholder out of the form with x-computed's own
 * resolveComputedInput, relative to `parentPath`.
 *
 * A missing value is not fatal, unlike x-computed, where it makes the whole
 * field unavailable: it renders as empty, and so does a value that can't be
 * printed, such as an object. A template is a label being assembled, so a
 * half-filled form gives a half-filled label.
 */
const resolveInputs = (rootData: unknown, parentPath: string, spec: TemplateSpec): Record<string, string> => {
  const values: Record<string, string> = {}

  for (const name of placeholders(spec.template)) {
    // No entry in `inputs`: the placeholder is its own path.
    const value: unknown = resolveComputedInput(rootData, parentPath, spec.inputs?.[name] ?? name)
    values[name] =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  }

  return values
}

/** `{seq(width)}`: the number, zero-padded to `width` digits (default 2) and never truncated. */
const seqFunction =
  (issued: number): TemplateFunction =>
  (width) => {
    const digits = width.trim() === '' ? DEFAULT_WIDTH : Number(width)
    return `${issued}`.padStart(Number.isInteger(digits) && digits >= 0 ? digits : DEFAULT_WIDTH, '0')
  }

/**
 * Matches values this template produced, capturing `{seq(…)}`. Every other
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
 * stampRowTemplates fills in a new row's `x-template` fields, advancing
 * `counters` for the numbered ones. `counters` is mutated: it is the caller's
 * record of what has already been handed out.
 *
 * `parentPath` is the object a template's inputs resolve against — for an
 * array, the object that CONTAINS it, not the row. A row being filled does
 * not exist yet, so there is nothing in it to read; what a template reaches
 * for (`{orderNo}`) sits alongside the array instead.
 *
 * A field the new row already carries a value for is left alone, so a caller
 * that supplies its own value keeps it.
 *
 * A numbered field gets one past whichever is higher: what `counters` has
 * already issued, or the highest number the existing rows carry.
 */
export const stampRowTemplates = (
  itemsSchema: JsonSchema | undefined,
  newRow: unknown,
  existingRows: unknown[],
  rootData: unknown,
  parentPath: string,
  counters: SequenceCounters,
): unknown => {
  const fields = templateFields(itemsSchema)
  if (fields.length === 0) return newRow

  const row = asRecord(newRow)
  if (!row) return newRow

  const stamped = { ...row }
  for (const [field, spec] of fields) {
    if (!isBlank(stamped[field])) continue

    const parts = parseTemplate(spec.template)
    const functions: Record<string, TemplateFunction> = {}
    if (parts.some(isSeq)) {
      if (!isReadable(parts)) {
        console.warn(
          `x-template: {seq(…)} needs literal text between it and other placeholders; not numbering "${spec.template}"`,
        )
        continue
      }
      // Both, every time: rows can arrive from outside the control — loaded
      // data, an undo, a paste — carrying numbers above anything this counter
      // has handed out, and reading only the counter would duplicate them.
      const issued = Math.max(counters[field] ?? 0, highestIssued(existingRows, field, spec)) + 1
      counters[field] = issued
      functions[SEQ] = seqFunction(issued)
    }
    stamped[field] = renderTemplate(spec.template, resolveInputs(rootData, parentPath, spec), functions)
  }
  return stamped
}
