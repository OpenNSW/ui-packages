import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 10 clears the rank-3 array testers (ArrayControlTester /
// PrimitiveArrayControlTester) outright. The `x-excel-export` keyword is
// distinct from `x-xml-export`/`x-xml`/`x-spreadsheet`, so there's no overlap
// with any of those testers on the same schema node — unlike XmlControlTester,
// nothing here needs to step aside for a co-located control (see the
// `spreadsheet` fixture: SpreadsheetControl's own field is `type: 'object'`,
// never `type: 'array'`, so it can never tie with this tester at the same
// scope).
export const ExcelExportControlTester = rankWith(
  10,
  schemaMatches((schema: JsonSchema) => {
    // typeof null === 'object' in JS, so `"x-excel-export": null` would match
    // without this and render the button for an empty configuration.
    const opts = (schema as Record<string, unknown>)['x-excel-export']
    return schema.type === 'array' && typeof opts === 'object' && opts !== null
  }),
)
