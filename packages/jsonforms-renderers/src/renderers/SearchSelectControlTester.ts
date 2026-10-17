import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

function xSearchService(schema: JsonSchema | undefined): string | undefined {
  if (!schema || typeof schema !== 'object') return undefined
  const xs = (schema as Record<string, unknown>)['x-search'] as { service?: unknown } | undefined
  return typeof xs?.service === 'string' && xs.service !== '' ? xs.service : undefined
}

/** Schema node that carries `x-search` — the field itself, or array `items`. */
export function searchSelectTargetSchema(schema: JsonSchema): JsonSchema | undefined {
  if (xSearchService(schema)) return schema
  if (schema.type === 'array') {
    const items = (schema as { items?: JsonSchema | JsonSchema[] }).items
    if (items && !Array.isArray(items) && xSearchService(items)) return items
  }
  return undefined
}

// Rank 4 beats ArrayControlTester (3) so array-of-x-search fields render as a
// multi SearchSelect instead of Add Item cards. Single string/object fields
// keep the same behaviour as before (still match; rank was already ≥ Text).
export const SearchSelectControlTester = rankWith(
  4,
  schemaMatches((schema: JsonSchema) => {
    const target = searchSelectTargetSchema(schema)
    if (!target) return false
    const t = target.type
    return t === 'string' || t === 'object'
  }),
)
