import type { JsonSchema } from '@jsonforms/core'
import { Resolve } from '@jsonforms/core'
import dayjs from 'dayjs'

// x-notLaterThan: path to another date/date-time field relative to this field's
// parent object (usually a same-level sibling key). Value must not be after the
// limit (equal OK). Paths use the same dot-joined form as ControlProps.path /
// Resolve.data. Splitting on "." breaks for property names that contain dots
// (JSON Forms-wide limitation).
//
// collectNotLaterThanErrors walks plain `properties` / `items` only — it does
// not resolve $ref, allOf, oneOf, anyOf, or if/then. DateControl still checks
// inline from the already-resolved control schema.

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

function appliesToFormat(schema: JsonSchema): boolean {
  return schema.format === 'date' || schema.format === 'date-time'
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** True when left is strictly after right. Date-only sides compare by calendar day. */
function isLaterThan(left: string, right: string): boolean {
  const l = dayjs(left)
  const r = dayjs(right)
  if (!l.isValid() || !r.isValid()) return false
  // Bare YYYY-MM-DD is local midnight; mixing with date-time would false-positive
  // the same calendar day. Impossible calendar dates (e.g. 2026-02-31) are left
  // to AJV format validation — dayjs coerces them.
  if (isDateOnly(left) || isDateOnly(right)) {
    return l.startOf('day').isAfter(r.startOf('day'))
  }
  return l.isAfter(r)
}

function siblingValue(rootData: unknown, controlPath: string, siblingKey: string): unknown {
  const parentPath = controlPath.split('.').slice(0, -1).join('.')
  return Resolve.data(rootData, parentPath ? `${parentPath}.${siblingKey}` : siblingKey)
}

function titleOf(propSchema: JsonSchema | undefined, key: string): string {
  return propSchema && typeof propSchema === 'object' && typeof propSchema.title === 'string' ? propSchema.title : key
}

/** Schema pointer for a data path (object properties + array items). */
function dataPathToSchemaPath(dataPath: string): string {
  let schemaPath = '#'
  for (const seg of dataPath.split('.')) {
    if (!seg) continue
    schemaPath += /^\d+$/.test(seg) ? '/items' : `/properties/${seg}`
  }
  return schemaPath
}

function siblingTitle(rootSchema: JsonSchema | undefined, controlPath: string, siblingKey: string): string {
  if (!rootSchema) return siblingKey
  const parentPath = controlPath.split('.').slice(0, -1).join('.')
  const siblingPath = parentPath ? `${parentPath}.${siblingKey}` : siblingKey
  const resolved = Resolve.schema(rootSchema, dataPathToSchemaPath(siblingPath), rootSchema)
  const fallback = siblingKey.includes('.') ? (siblingKey.split('.').pop() ?? siblingKey) : siblingKey
  return titleOf(resolved, fallback)
}

function instancePathToDataPath(instancePath: string, key: string): string {
  const base = instancePath.replace(/^\//, '').replace(/\//g, '.')
  return base ? `${base}.${key}` : key
}

/** Inline error string for DateControl, or undefined when OK / inapplicable. */
export function notLaterThanControlError(
  rootData: unknown,
  controlPath: string,
  data: unknown,
  schema: JsonSchema,
  label: string,
  rootSchema?: JsonSchema,
): string | undefined {
  if (!appliesToFormat(schema)) return undefined
  const limitField = (schema as { 'x-notLaterThan'?: unknown })['x-notLaterThan']
  if (typeof limitField !== 'string' || typeof data !== 'string' || data === '') return undefined
  const sibling = siblingValue(rootData, controlPath, limitField)
  if (typeof sibling !== 'string' || sibling === '' || !isLaterThan(data, sibling)) return undefined
  return message(label || controlPath, siblingTitle(rootSchema, controlPath, limitField))
}

/**
 * AJV-shaped errors for host submit gating (and optionally `additionalErrors`).
 * Walks plain properties/items only — see file header for $ref / combinator limits.
 */
export function collectNotLaterThanErrors(
  schema: JsonSchema | undefined,
  data: unknown,
  instancePath = '',
  rootData: unknown = data,
  rootSchema: JsonSchema | undefined = schema,
): NotLaterThanError[] {
  if (!schema || typeof schema !== 'object') return []
  const properties = schema.properties
  const out: NotLaterThanError[] = []

  if (properties && data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    for (const [key, propSchema] of Object.entries(properties)) {
      if (!propSchema || typeof propSchema !== 'object') continue
      const limitField = (propSchema as { 'x-notLaterThan'?: unknown })['x-notLaterThan']
      if (typeof limitField === 'string' && appliesToFormat(propSchema)) {
        const controlPath = instancePathToDataPath(instancePath, key)
        const left = obj[key]
        const right = siblingValue(rootData, controlPath, limitField)
        if (typeof left === 'string' && typeof right === 'string' && isLaterThan(left, right)) {
          out.push({
            instancePath: `${instancePath}/${key}`,
            schemaPath: `#/properties/${key}/x-notLaterThan`,
            keyword: 'x-notLaterThan',
            params: { limitField },
            message: message(titleOf(propSchema, key), siblingTitle(rootSchema, controlPath, limitField)),
          })
        }
      }
      if (obj[key] === undefined) continue
      out.push(...collectNotLaterThanErrors(propSchema, obj[key], `${instancePath}/${key}`, rootData, rootSchema))
    }
  }

  const items = schema.items
  if (items && !Array.isArray(items) && Array.isArray(data)) {
    data.forEach((item, index) => {
      out.push(...collectNotLaterThanErrors(items, item, `${instancePath}/${index}`, rootData, rootSchema))
    })
  }

  return out
}
