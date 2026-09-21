import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 10 clears the rank-3 array testers (ArrayControlTester/
// PrimitiveArrayControlTester) outright. `x-xml-export` is a distinct keyword
// from `x-xml`/`x-spreadsheet`, so there's no tie with XmlControlTester/
// SpreadsheetControlTester on the same schema NODE — see XmlControlTester's
// own comment for what happens when the same uischema *scope* hosts both.
export const XmlExportControlTester = rankWith(
  10,
  schemaMatches((schema: JsonSchema) => {
    // typeof null === 'object' in JS, so `"x-xml-export": null` would match
    // without this and render a button for an empty configuration.
    const opts = (schema as Record<string, unknown>)['x-xml-export']
    return (schema.type === 'object' || schema.type === 'array') && typeof opts === 'object' && opts !== null
  }),
)
