import type { ControlProps } from '@jsonforms/core'

/**
 * Whether to show the red required asterisk.
 *
 * JSON Forms only sets `required` from the parent schema's top-level
 * `required` array — not from conditional `allOf` / `if` / `then`. Forms can
 * force the indicator with `uischema.options.required: true` while keeping
 * validation conditional (so hidden fields cleared on other outcomes still
 * submit).
 */
export const showRequiredAsterisk = ({
  required,
  uischema,
}: Pick<ControlProps, 'required' | 'uischema'>): boolean =>
  Boolean(required || uischema.options?.required)
