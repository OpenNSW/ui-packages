const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g

type Printable = string | number | boolean | bigint

const isPrintable = (value: unknown): value is Printable =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'

// Only names `values` owns with a printable value are filled; anything else stays as written so mistakes show.
export function renderTemplate(template: string, values: object): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return placeholder
    const value: unknown = (values as Record<string, unknown>)[name]
    if (value === null || value === undefined) return ''
    return isPrintable(value) ? String(value) : placeholder
  })
}
