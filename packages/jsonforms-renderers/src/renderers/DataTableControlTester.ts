import { rankWith, and, uiTypeIs, optionIs, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Sits above ArrayControlTester (rank 3), but only when the uiSchema opts in
// with `options.table`. Arrays without it keep the editable card renderer.
export const DataTableControlTester = rankWith(
  20,
  and(
    uiTypeIs('Control'),
    optionIs('table', true),
    schemaMatches((schema: JsonSchema) => schema.type === 'array'),
  ),
)
