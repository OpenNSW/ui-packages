import { useMemo } from 'react'
import { useJsonForms } from '@jsonforms/react'
import { isPathRequiredBySchema } from '../utils/required'

/**
 * Whether the control at `path` is required under the current form data.
 * ORs JSONForms' static `required` prop with an AJV check that also sees
 * conditional schema rules (`allOf`/`if`/`then`, etc.) that core's
 * `isRequired()` ignores.
 */
export function useIsRequired(path: string, staticRequired = false): boolean {
  const ctx = useJsonForms()
  const rootData = ctx.core?.data
  const validator = ctx.core?.validator

  return useMemo(() => {
    if (staticRequired) return true
    return isPathRequiredBySchema(path, rootData, validator)
  }, [staticRequired, path, rootData, validator])
}
