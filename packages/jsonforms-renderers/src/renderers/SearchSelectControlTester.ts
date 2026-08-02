import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

export const SearchSelectControlTester = rankWith(
  3,
  schemaMatches((schema: JsonSchema) => {
    const xs = (schema as Record<string, unknown>)['x-search'] as { service?: unknown } | undefined
    return schema.type === 'string' && typeof xs?.service === 'string' && xs.service !== ''
  }),
)
