import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 10 matches FileControlTester/SpreadsheetControlTester — enough to beat
// the default object/Group renderer for a `type: 'object'` schema. The rank ties
// with those, and @jsonforms/react breaks a tie by registration order, so the
// entry in renderers/index.ts is placed deliberately.
export const XmlControlTester = rankWith(
  10,
  schemaMatches((schema: JsonSchema) => {
    // typeof null === 'object' in JS, so `"x-xml": null` would match without
    // this and render an upload control for an empty configuration.
    const xXml = (schema as Record<string, unknown>)['x-xml']
    return schema.type === 'object' && typeof xXml === 'object' && xXml !== null
  }),
)
