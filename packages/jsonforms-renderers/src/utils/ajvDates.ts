import { createAjv } from '@jsonforms/core'

import { localISODate } from './localDate'

type JsonFormsAjv = ReturnType<typeof createAjv>

type DateFormat = {
  validate?: (data: string) => boolean
  compare?: (data: string, compareTo: string) => number
}

/**
 * Teach Ajv's `date` and `date-time` formats that `formatMinimum: "today"`
 * means the current local calendar day. Call this on the app's Ajv instance
 * before any schema is compiled. A fixed date still uses the original compare.
 * Without this wrap, `"today"` fails every value.
 */
export function withRelativeDates<T extends JsonFormsAjv>(ajv: T): T {
  const formats = ajv.formats as Record<string, DateFormat | string | undefined>
  for (const name of ['date', 'date-time']) {
    const base = formats[name]
    if (!base || typeof base === 'string' || typeof base.compare !== 'function') continue
    const compare = base.compare.bind(base)
    const addFormat = ajv.addFormat.bind(ajv) as (formatName: string, format: DateFormat) => unknown
    addFormat(name, {
      ...base,
      compare: (data: string, limit: string) => {
        if (limit !== 'today') return compare(data, limit)
        const day = data.slice(0, 10)
        const today = localISODate()
        if (day < today) return -1
        if (day > today) return 1
        return 0
      },
    })
  }
  return ajv
}
