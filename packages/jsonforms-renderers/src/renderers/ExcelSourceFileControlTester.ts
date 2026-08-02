import { rankWith, and, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'
import { getExcelSpec } from '../utils/excelTable'

// Sits above FileControlTester (rank 10) so an `x-excel` file field gets the
// parsing variant. Files without that block keep the plain FileControl.
export const ExcelSourceFileControlTester = rankWith(
  20,
  and(
    schemaMatches(
      (schema: JsonSchema) =>
        schema.type === 'string' && schema.format === 'file' && getExcelSpec(schema) !== undefined,
    ),
  ),
)
