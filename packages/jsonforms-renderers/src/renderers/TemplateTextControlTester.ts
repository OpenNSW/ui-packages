import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 5 beats TextControlTester's rank 1 for a `type: 'string'` schema
// carrying `x-text`, as ComputedControlTester does for `x-computed`.
export const TemplateTextControlTester = rankWith(
  5,
  schemaMatches((schema: JsonSchema) => {
    // typeof null === 'object': "x-text": null falls through to the text control.
    const xText = (schema as Record<string, unknown>)['x-text']
    return schema.type === 'string' && typeof xText === 'object' && xText !== null
  }),
)
