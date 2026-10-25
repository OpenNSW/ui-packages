import { createContext, useContext } from 'react'
import { useJsonForms } from '@jsonforms/react'
import { formatMessage } from '../utils/messages'

/**
 * True where nothing can be changed and values read as answers: a stepper's
 * review step, or a read-only stepper.
 */
export const FormReviewContext = createContext(false)

/**
 * Whether a control marks itself read-only (a lock at the end of the field):
 * it can't be changed, in a form where other fields can. A form that is
 * read-only throughout, or a review of one, needs no mark on every field.
 */
export function useReadOnlyMark(enabled: boolean | undefined): boolean {
  const readonlyForm = useJsonForms().readonly === true
  const inReview = useContext(FormReviewContext)
  return enabled === false && !readonlyForm && !inReview
}

/** An answer left empty, looked up as `form.notProvided`. */
export const EMPTY_ANSWER = 'Not provided'

export interface PlaceholderProps {
  placeholder?: string
  /** Set where the placeholder says the answer was left empty. */
  'data-empty-answer'?: ''
}

/**
 * A field's placeholder: its own where it can be filled in, and "Not
 * provided" where values read as answers (a read-only form, a stepper's
 * review step or read-only view), so an empty answer reads as one rather than
 * as a blank or a hint. The host can style it by `data-empty-answer`.
 */
export function useAnswerPlaceholder(placeholder: string | undefined): PlaceholderProps {
  const ctx = useJsonForms()
  const inReview = useContext(FormReviewContext)
  if (ctx.readonly !== true && !inReview) return { placeholder }
  return {
    placeholder: formatMessage(ctx.i18n?.translate, 'form.notProvided', EMPTY_ANSWER),
    'data-empty-answer': '',
  }
}
