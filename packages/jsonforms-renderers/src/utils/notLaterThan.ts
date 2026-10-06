import type { JsonSchema } from '@jsonforms/core'
import { Resolve } from '@jsonforms/core'
import dayjs from 'dayjs'

// Schema keyword on a date / date-time property: the local value must not be
// later than the named sibling field (same parent object). Compared with
// dayjs so plain `YYYY-MM-DD` and RFC 3339 date-times both work; equal is OK.

export type NotLaterThanError = {
  instancePath: string
  schemaPath: string
  keyword: 'x-notLaterThan'
  params: { limitField: string }
  message: string
}

export function notLaterThanMessage(leftTitle: string, rightTitle: string): string {
  return `${leftTitle} cannot be later than ${rightTitle}`
}

// True when both parse as dates and left is strictly after right.
export function isLaterThan(left: string, right: string): boolean {
  const l = dayjs(left)
  const r = dayjs(right)
  if (!l.isValid() || !r.isValid()) return false
  return l.isAfter(r)
}

// Sibling value for a control at JsonForms `path` (dot-separated).
export function resolveSiblingValue(rootData: unknown, controlPath: string, siblingKey: string): unknown {
  const parentPath = controlPath.split('.').slice(0, -1).join('.')
  const siblingPath = parentPath ? `${parentPath}.${siblingKey}` : siblingKey
  return Resolve.data(rootData, siblingPath)
}

function propertyTitle(propSchema: JsonSchema | undefined, key: string): string {
  if (propSchema && typeof propSchema === 'object' && typeof propSchema.title === 'string') {
    return propSchema.title
  }
  return key
}

// Inline error for DateControl when this field's x-notLaterThan sibling is earlier.
// `rightTitle` defaults to the sibling property name when the host has no
// schema title handy (collectNotLaterThanErrors resolves titles for submit).
export function notLaterThanControlError(
  rootData: unknown,
  controlPath: string,
  data: unknown,
  schema: JsonSchema,
  label: string,
  rightTitle?: string,
): string | undefined {
  const limitField = (schema as { 'x-notLaterThan'?: unknown })['x-notLaterThan']
  if (typeof limitField !== 'string' || typeof data !== 'string' || data === '') return undefined
  const sibling = resolveSiblingValue(rootData, controlPath, limitField)
  if (typeof sibling !== 'string' || sibling === '' || !isLaterThan(data, sibling)) return undefined
  return notLaterThanMessage(label || controlPath, rightTitle || limitField)
}

// AJV-shaped errors for JsonForms `additionalErrors` (submit gating in hosts).
// Walks object / array schemas the same way trader FormRenderer walks required.
export function collectNotLaterThanErrors(
  schema: JsonSchema | undefined,
  data: unknown,
  instancePath = '',
): NotLaterThanError[] {
  if (!schema || typeof schema !== 'object') return []
  const properties = schema.properties
  const items = schema.items
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
            message: notLaterThanMessage(propertyTitle(propSchema, key), propertyTitle(properties[limitField], limitField)),
          })
        }
      }
      if (obj[key] === undefined) continue
      out.push(...collectNotLaterThanErrors(propSchema, obj[key], `${instancePath}/${key}`))
    }
  }

  if (items && !Array.isArray(items) && Array.isArray(data)) {
    data.forEach((item, index) => {
      out.push(...collectNotLaterThanErrors(items, item, `${instancePath}/${index}`))
    })
  }

  return out
}
