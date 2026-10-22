import { createAjv } from '@jsonforms/core'
import { addDateBounds } from '../src/utils/dateBound'

// Shared Ajv instance for every JsonForms usage. createAjv applies JsonForms'
// own defaults (format validators etc.); useDefaults: true additionally lets
// Ajv populate schema `default` values into the data during validation, so
// defaulted fields are present without the user touching them. addDateBounds
// makes formatMinimum "today" mean the local calendar day.
export const ajv = addDateBounds(createAjv({ useDefaults: true }))
