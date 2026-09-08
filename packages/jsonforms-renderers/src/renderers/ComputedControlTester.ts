import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 5 beats NumberControlTester's rank 2 for a `type: 'number'` schema
// carrying `x-computed`, following the same "custom x-* keyword outranks the
// generic control" convention as SpreadsheetControlTester/FileControlTester
// (10) and SearchSelectControlTester (3).
export const ComputedControlTester = rankWith(
  5,
  schemaMatches((schema: JsonSchema) => {
    // typeof null === 'object' in JS — exclude it explicitly, or
    // "x-computed": null would match and evaluate an empty configuration
    // instead of falling through to the normal number control.
    const xComputed = (schema as Record<string, unknown>)['x-computed']
    return schema.type === 'number' && typeof xComputed === 'object' && xComputed !== null
  }),
)
