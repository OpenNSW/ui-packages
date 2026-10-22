const DAY = /^(\d{4}-\d{2}-\d{2})/

/** The trader's local calendar day, `YYYY-MM-DD`. "today" is that day, not UTC. */
export function localISODate(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function calendarDay(value: string, now = new Date()): string | undefined {
  const resolved = value === 'today' ? localISODate(now) : value
  return DAY.exec(resolved)?.[1]
}

/** Picker `min` for a date or date-time schema that sets `formatMinimum`. */
export function earliestCalendarDay(
  schema: { format?: string; formatMinimum?: unknown },
  now = new Date(),
): string | undefined {
  if (schema.format === 'time' || typeof schema.formatMinimum !== 'string') return undefined
  return calendarDay(schema.formatMinimum, now)
}

type Compare = ((a: string, b: string) => number | undefined) & { today?: boolean }

/**
 * JsonForms' Ajv already has `formatMinimum`. Its date compare does not know
 * the word "today", so a bound of `"today"` would not mean the local day.
 * This resolves that word when `date` and `date-time` are compared. Call it
 * on the Ajv instance passed to JsonForms. A second call does nothing.
 */
export function addDateBounds<T extends { formats: Record<string, unknown> }>(ajv: T): T {
  for (const name of ['date', 'date-time']) {
    const format = ajv.formats[name]
    if (!format || typeof format !== 'object' || format instanceof RegExp) continue
    const current = (format as { compare?: Compare }).compare
    if (!current || current.today) continue
    const compare: Compare = (a, b) => current(a === 'today' ? localISODate() : a, b === 'today' ? localISODate() : b)
    compare.today = true
    ;(format as { compare: Compare }).compare = compare
  }
  return ajv
}
