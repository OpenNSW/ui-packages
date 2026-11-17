import { addDays, format, parseISO } from 'date-fns'

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
 * `YYYY-MM-DD` prefix. Anything else is ignored.
 */
export function resolveFormatDay(limit: string, now = new Date()): string | undefined {
  if (limit === 'today') return localISODate(now)
  const day = limit.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined
}

type FormatLimitSchema = {
  format?: string
  formatMinimum?: unknown
  formatMaximum?: unknown
  formatExclusiveMinimum?: unknown
  formatExclusiveMaximum?: unknown
}

/** Shift a `YYYY-MM-DD` day by `delta` calendar days. */
function shiftDay(day: string, delta: number): string {
  return format(addDays(parseISO(day), delta), 'yyyy-MM-dd')
}

/**
 * Native date-input `min` / `max` from the schema's format-limit keywords.
 * Exclusive bounds move one day so the picker matches Ajv's compare.
 * Time-only fields have no day bounds.
 */
export function datePickerBounds(schema: FormatLimitSchema, now = new Date()): { min?: string; max?: string } {
  if (schema.format === 'time') return {}

  let min: string | undefined
  let max: string | undefined

  if (typeof schema.formatExclusiveMinimum === 'string') {
    const day = resolveFormatDay(schema.formatExclusiveMinimum, now)
    if (day) min = shiftDay(day, 1)
  } else if (typeof schema.formatMinimum === 'string') {
    min = resolveFormatDay(schema.formatMinimum, now)
  }

  if (typeof schema.formatExclusiveMaximum === 'string') {
    const day = resolveFormatDay(schema.formatExclusiveMaximum, now)
    if (day) max = shiftDay(day, -1)
  } else if (typeof schema.formatMaximum === 'string') {
    max = resolveFormatDay(schema.formatMaximum, now)
  }

  return { min, max }
}
