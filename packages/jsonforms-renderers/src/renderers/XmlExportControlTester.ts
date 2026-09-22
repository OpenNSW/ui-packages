import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 10 clears the rank-3 array testers (ArrayControlTester/
// PrimitiveArrayControlTester) outright, and the default object/Group
// renderer for a `type: 'object'` schema. `x-xml-export` is a distinct
// keyword from `x-xml`/`x-spreadsheet`, so there's no tie with
// XmlControlTester/SpreadsheetControlTester on the same schema node.
//
// `type: 'object'` only: this control never reads the scope it's bound to
// (writeTo assembles the exported document from elsewhere in the form), so
// the scope is purely a config-holder + button placement — an array schema
// has no meaningful advantage over an object one there, and requiring object
// keeps one shape to document rather than two.
export const XmlExportControlTester = rankWith(
  10,
  schemaMatches((schema: JsonSchema) => {
    // typeof null === 'object' in JS, so `"x-xml-export": null` would match
    // without this and render a button for an empty configuration.
    const opts = (schema as Record<string, unknown>)['x-xml-export']
    return schema.type === 'object' && typeof opts === 'object' && opts !== null
  }),
)
