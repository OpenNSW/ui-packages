import type { Translator } from '@jsonforms/core'
import { formatMessage } from './messages'

/**
 * The stepper's own wording, in English. Each is looked up through the form's
 * JSON Forms `i18n.translate` as `stepper.<key>`, with this text as the
 * default. `{name}` placeholders are filled in after translation, so a
 * translation keeps them.
 */
export const STEPPER_MESSAGES = {
  back: 'Back',
  continue: 'Continue',
  stepOf: 'Step {step} of {total}',
  review: 'Review and Submit',
  navLabel: 'Form steps',
  progressLabel: 'Progress through the form',
  noteDone: 'Done',
  noteToFix: '{count} to fix',
  noteItem: '{count} item added',
  noteItems: '{count} items added',
  noteField: '{count} field',
  noteFields: '{count} fields',
  noteReview: 'Check and submit',
  missingFields: 'Complete these fields to continue:',
  incompleteSteps: 'Some steps are not complete yet:',
  reviewHint: 'Check your answers below, then submit.',
  edit: 'Edit',
  editStep: 'Edit {step}',
  contentsLabel: 'Sections',
  jumpTo: 'Jump to section',
} as const

export type StepperMessage = keyof typeof STEPPER_MESSAGES

/** Formats one of the stepper's messages through `translate`. */
export function stepperText(
  translate: Translator | undefined,
  key: StepperMessage,
  values?: Record<string, string | number>,
): string {
  return formatMessage(translate, `stepper.${key}`, STEPPER_MESSAGES[key], values)
}
