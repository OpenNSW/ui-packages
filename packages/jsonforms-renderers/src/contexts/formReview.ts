import { createContext, useContext } from 'react'
import { useJsonForms } from '@jsonforms/react'

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
