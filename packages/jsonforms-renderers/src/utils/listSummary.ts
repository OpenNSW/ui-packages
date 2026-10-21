import type { JsonSchema } from '@jsonforms/core'

/**
 * A running total above a list: the sum of `field` (a dotted path within the
 * item) across its rows, shown through `label` ("{sum} bags").
 */
export interface ListTotal {
  field: string
  label: string
}

const SEPARATOR = ' · '
// {name} or {a.b.c}: a dotted path within the row. Not template.ts's
// PLACEHOLDER, which has calls but no paths.
const FIELD = /\{([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\}/g

/** The value at a dotted path within the row. */
function valueAt(row: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur === null || typeof cur !== 'object') return undefined
    return (cur as Record<string, unknown>)[key]
  }, row)
}

/** The schema at a dotted path within the item's schema. */
function schemaAt(schema: JsonSchema | undefined, path: string): JsonSchema | undefined {
  return path.split('.').reduce<JsonSchema | undefined>((cur, key) => cur?.properties?.[key], schema)
}

function optionTitle(schema: JsonSchema | undefined, value: unknown): string | undefined {
  const options = schema?.oneOf ?? schema?.anyOf
  return Array.isArray(options) ? options.find((o) => o.const === value)?.title : undefined
}

/**
 * A value as a card shows it: an option's title, a number with separators,
 * text, a search pick's `label`, or the title of a `{ value }` object's
 * option. Anything else is empty.
 */
function display(value: unknown, schema: JsonSchema | undefined, locale: string | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>
    if (typeof object.label === 'string') return object.label
    if ('value' in object) return display(object.value, schema?.properties?.value, locale)
    return ''
  }
  const title = optionTitle(schema, value)
  if (title) return title
  if (typeof value === 'number') return new Intl.NumberFormat(locale).format(value)
  return typeof value === 'string' ? value : ''
}

/**
 * A row's one-line summary from a template such as
 * `"{dc_grade} · {number_of_bags} bags"`. The template is split on " · ", and
 * a segment whose fields are all empty is left out, so a half-filled row reads
 * "FINE" rather than "FINE ·  bags". Unlike `renderTemplate`, a missing value
 * is shown as nothing, never as the placeholder.
 */
export function summarizeRow(template: string, row: unknown, itemsSchema: JsonSchema, locale?: string): string {
  return template
    .split(SEPARATOR)
    .map((segment) => {
      let fields = 0
      let filled = 0
      const text = segment.replace(FIELD, (_placeholder, path: string) => {
        fields++
        const shown = display(valueAt(row, path), schemaAt(itemsSchema, path), locale)
        if (shown) filled++
        return shown
      })
      return fields > 0 && filled === 0 ? '' : text.trim()
    })
    .filter(Boolean)
    .join(SEPARATOR)
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

/** Each total that at least one row has a number for, formatted through its label. */
export function listTotals(rows: unknown[], totals: ListTotal[], locale?: string): string[] {
  const format = new Intl.NumberFormat(locale)
  return totals.flatMap((total) => {
    const numbers = rows.map((row) => asNumber(valueAt(row, total.field))).filter((n): n is number => n !== undefined)
    if (!numbers.length) return []
    return [total.label.replace('{sum}', format.format(numbers.reduce((a, b) => a + b, 0)))]
  })
}
