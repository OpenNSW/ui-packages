import { addDays, format, isValid, parse } from 'date-fns'

/** The current local calendar day, as YYYY-MM-DD. */
export function localISODate(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Resolve a format-limit value to a calendar day.
 * `"today"` is the current local day; a fixed date (or date-time) keeps its
 * `YYYY-MM-DD` prefix. Invalid or non-date values are ignored.
 */
export function resolveFormatDay(limit: string, now = new Date()): string | undefined {
  if (limit === 'today') return localISODate(now)
  const day = limit.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined
  // Parse as local civil time (not UTC) so the day does not shift with offset.
  const parsed = parse(day, 'yyyy-MM-dd', now)
  if (!isValid(parsed) || format(parsed, 'yyyy-MM-dd') !== day) return undefined
  return day
}

type FormatLimitSchema = {
  format?: string
  formatMinimum?: unknown
  formatMaximum?: unknown
  formatExclusiveMinimum?: unknown
  formatExclusiveMaximum?: unknown
}

/** Shift a `YYYY-MM-DD` day by `delta` local calendar days. */
function shiftDay(day: string, delta: number, now = new Date()): string {
  return format(addDays(parse(day, 'yyyy-MM-dd', now), delta), 'yyyy-MM-dd')
}

function inclusiveDay(limit: unknown, now: Date): string | undefined {
  return typeof limit === 'string' ? resolveFormatDay(limit, now) : undefined
}

function exclusiveMinDay(limit: unknown, now: Date): string | undefined {
  if (typeof limit !== 'string') return undefined
  const day = resolveFormatDay(limit, now)
  return day ? shiftDay(day, 1, now) : undefined
}

function exclusiveMaxDay(limit: unknown, now: Date): string | undefined {
  if (typeof limit !== 'string') return undefined
  const day = resolveFormatDay(limit, now)
  return day ? shiftDay(day, -1, now) : undefined
}

/**
 * Native date-input `min` / `max` from the schema's format-limit keywords.
 * Exclusive bounds move one day so the picker matches Ajv's compare.
 * When both inclusive and exclusive are set, the stricter day wins.
 * Time-only fields and non-string limits (e.g. `$data`) have no day bounds.
 */
export function datePickerBounds(schema: FormatLimitSchema, now = new Date()): { min?: string; max?: string } {
  if (schema.format === 'time') return {}

  const mins = [inclusiveDay(schema.formatMinimum, now), exclusiveMinDay(schema.formatExclusiveMinimum, now)].filter(
    (day): day is string => day !== undefined,
  )
  const maxs = [inclusiveDay(schema.formatMaximum, now), exclusiveMaxDay(schema.formatExclusiveMaximum, now)].filter(
    (day): day is string => day !== undefined,
  )

  return {
    min: mins.length ? mins.reduce((a, b) => (a >= b ? a : b)) : undefined,
    max: maxs.length ? maxs.reduce((a, b) => (a <= b ? a : b)) : undefined,
  }
}
