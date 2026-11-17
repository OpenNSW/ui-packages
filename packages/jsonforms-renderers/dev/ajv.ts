import { createAjv } from '@jsonforms/core'

import { withRelativeDates } from '../src/utils/ajvDates'

// Shared Ajv instance for every JsonForms usage. createAjv applies JsonForms'
// own defaults (format validators etc.); useDefaults: true additionally lets
// Ajv populate schema `default` values into the data during validation, so
// defaulted fields are present without the user touching them.
// withRelativeDates teaches formatMinimum: "today" before any schema compiles.
export const ajv = withRelativeDates(createAjv({ useDefaults: true }))
