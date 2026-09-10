import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 10 matches FileControlTester/SpreadsheetControlTester — enough to beat
// the default object/Group renderer for a `type: 'object'` schema.
//
// Keyed on `x-xml`, the parse configuration, which is what makes this control
// applicable at all.
//
// Note the rank ties with SpreadsheetControlTester. @jsonforms/react picks a
// renderer with lodash `maxBy`, which returns the FIRST maximum, so registration
// order in renderers/index.ts decides a tie — XmlControl is registered after
// SpreadsheetControl, meaning a schema carrying both keywords renders as a
// spreadsheet. That is only reachable via a config mistake, so it gets a comment
// rather than defensive code.
export const XmlControlTester = rankWith(
  10,
  schemaMatches((schema: JsonSchema) => {
    // typeof null === 'object' in JS — exclude it explicitly, or `"x-xml": null`
    // would match and render an upload control for an empty configuration
    // instead of falling through to the default object renderer. Follows
    // ComputedControlTester's precedent.
    const xXml = (schema as Record<string, unknown>)['x-xml']
    return schema.type === 'object' && typeof xXml === 'object' && xXml !== null
  }),
)
