import { rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

export const SpreadsheetControlTester = rankWith(
  10, // matches FileControlTester's rank — beats the default object/Group renderer
  schemaMatches(
    (schema: JsonSchema) =>
      schema.type === 'object' && typeof (schema as Record<string, unknown>)['x-spreadsheet'] === 'object',
  ),
)
