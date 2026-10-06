import type { JsonSchema } from '@jsonforms/core'
import { Resolve } from '@jsonforms/core'
import dayjs from 'dayjs'

// x-notLaterThan: "<sibling>" on a date/date-time field — local value must not
// be after the sibling (equal OK). dayjs covers YYYY-MM-DD and RFC 3339.

export type NotLaterThanError = {
  instancePath: string
  schemaPath: string
  keyword: 'x-notLaterThan'
  params: { limitField: string }
  message: string
}

function message(leftTitle: string, rightTitle: string): string {
  return `${leftTitle} cannot be later than ${rightTitle}`
}

function isLaterThan(left: string, right: string): boolean {
  const l = dayjs(left)
  const r = dayjs(right)
  return l.isValid() && r.isValid() && l.isAfter(r)
}

function siblingValue(rootData: unknown, controlPath: string, siblingKey: string): unknown {
  const parentPath = controlPath.split('.').slice(0, -1).join('.')
  return Resolve.data(rootData, parentPath ? `${parentPath}.${siblingKey}` : siblingKey)
}

function titleOf(propSchema: JsonSchema | undefined, key: string): string {
  return propSchema && typeof propSchema === 'object' && typeof propSchema.title === 'string' ? propSchema.title : key
}

/** Inline error string for DateControl, or undefined when OK / inapplicable. */
export function notLaterThanControlError(
  rootData: unknown,
  controlPath: string,
  data: unknown,
  schema: JsonSchema,
  label: string,
): string | undefined {
  const limitField = (schema as { 'x-notLaterThan'?: unknown })['x-notLaterThan']
  if (typeof limitField !== 'string' || typeof data !== 'string' || data === '') return undefined
  const sibling = siblingValue(rootData, controlPath, limitField)
  if (typeof sibling !== 'string' || sibling === '' || !isLaterThan(data, sibling)) return undefined
  return message(label || controlPath, limitField)
}

/** AJV-shaped errors for JsonForms `additionalErrors` (host submit gating). */
export function collectNotLaterThanErrors(
  schema: JsonSchema | undefined,
  data: unknown,
  instancePath = '',
): NotLaterThanError[] {
  if (!schema || typeof schema !== 'object') return []
  const properties = schema.properties
  const out: NotLaterThanError[] = []

  if (properties && data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!propSchema || typeof propSchema !== 'object') continue
      const limitField = (propSchema as { 'x-notLaterThan'?: unknown })['x-notLaterThan']
      if (typeof limitField === 'string') {
        const left = obj[key]
        const right = obj[limitField]
        if (typeof left === 'string' && typeof right === 'string' && isLaterThan(left, right)) {
          out.push({
            instancePath: `${instancePath}/${key}`,
            schemaPath: `#/properties/${key}/x-notLaterThan`,
            keyword: 'x-notLaterThan',
            params: { limitField },
            message: message(titleOf(propSchema, key), titleOf(properties[limitField], limitField)),
          })
        }
      }
      if (obj[key] === undefined) continue
      out.push(...collectNotLaterThanErrors(propSchema, obj[key], `${instancePath}/${key}`))
    }
  }

  const items = schema.items
  if (items && !Array.isArray(items) && Array.isArray(data)) {
    data.forEach((item, index) => {
      out.push(...collectNotLaterThanErrors(items, item, `${instancePath}/${index}`))
    })
  }

  return out
}
