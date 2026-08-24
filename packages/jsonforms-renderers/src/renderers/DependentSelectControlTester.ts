import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

export const DependentSelectControlTester = rankWith(
  4,
  schemaMatches((schema: JsonSchema) => {
    const dependsOn = (schema as Record<string, unknown>)['x-depends-on']
    return typeof dependsOn === 'string' && dependsOn !== '' && Array.isArray(schema.oneOf)
  }),
)