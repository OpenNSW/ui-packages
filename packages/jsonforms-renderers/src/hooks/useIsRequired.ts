import { useMemo } from 'react'
import { useJsonForms } from '@jsonforms/react'
import { isPathRequiredBySchema, schemaHasConditionalRequired } from '../utils/required'

/**
 * Whether the control at `path` is required under the current form data.
 * ORs JSONForms' static `required` prop with an AJV check that also sees
 * conditional schema rules (`allOf`/`if`/`then`, etc.) that core's
 * `isRequired()` ignores.
 *
 * Skips the AJV path when the control is hidden, already statically required,
 * or the root schema has no conditional-required constructs.
 */
export function useIsRequired(path: string, staticRequired = false, visible = true): boolean {
  const ctx = useJsonForms()
  const rootData = ctx.core?.data
  const validator = ctx.core?.validator
  const rootSchema = ctx.core?.schema

  return useMemo(() => {
    if (!visible) return false
    if (staticRequired) return true
    if (!schemaHasConditionalRequired(rootSchema)) return false
    return isPathRequiredBySchema(path, rootData, validator)
  }, [visible, staticRequired, path, rootData, validator, rootSchema])
}
