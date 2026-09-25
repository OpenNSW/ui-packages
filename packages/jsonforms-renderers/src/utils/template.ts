import dayjs from 'dayjs'

// {name} is a value; {name(arg)} calls a function with the raw text between the parentheses.
const PLACEHOLDER = /\{([A-Za-z0-9_]+)(?:\(([^(){}]*)\))?\}/g

export type TemplateFunction = (arg: string) => unknown

export type TemplatePart = string | { name: string; arg?: string }

type Printable = string | number | boolean | bigint

const BUILTIN_FUNCTIONS: Readonly<Record<string, TemplateFunction>> = {
  today: (format) => dayjs().format(format || 'YYYY-MM-DD'),
}

const isPrintable = (value: unknown): value is Printable =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'

const owns = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key)

// Only an owned, printable result is written; anything else stays as written so mistakes show.
export function renderTemplate(
  template: string,
  values: object,
  functions: Readonly<Record<string, TemplateFunction>> = {},
): string {
  const available: Record<string, TemplateFunction> = { ...BUILTIN_FUNCTIONS, ...functions }
  return template.replace(PLACEHOLDER, (placeholder, name: string, arg: string | undefined) => {
    let value: unknown
    if (arg === undefined) {
      if (!owns(values, name)) return placeholder
      value = (values as Record<string, unknown>)[name]
    } else {
      if (!owns(available, name)) return placeholder
      try {
        value = available[name](arg)
      } catch {
        return placeholder
      }
    }
    if (value === null || value === undefined) return ''
    return isPrintable(value) ? String(value) : placeholder
  })
}

export function parseTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = []
  let last = 0
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match.index > last) parts.push(template.slice(last, match.index))
    parts.push(match[2] === undefined ? { name: match[1] } : { name: match[1], arg: match[2] })
    last = match.index + match[0].length
  }
  if (last < template.length) parts.push(template.slice(last))
  return parts
}
