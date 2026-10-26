import { createContext, useContext, type ReactNode } from 'react'

/**
 * Contract between a stepper form (a Categorization with
 * `options.variant: "stepper"`) and the application hosting it. The renderer
 * owns the steps; the application owns the buttons that submit the form, and
 * uses these callbacks to offer them only on the review step and to reveal
 * field errors once the trader has tried to move on.
 */
export interface FormStepState {
  /** Zero-based index of the step on screen; equals `count` on the review step. */
  step: number
  /** Number of form steps, not counting the review step. */
  count: number
  /** True on the final "Review and Submit" step. */
  last: boolean
}

export interface FormStepsContextValue {
  onStepChange?: (state: FormStepState) => void
  /**
   * The host's own buttons (Save as draft, and Submit on the last step),
   * shown in the stepper's footer between Back and Continue, so the form has
   * one row of actions instead of two.
   */
  actions?: ReactNode
  /** Continue was pressed on a step that still has errors. */
  onInvalidStep?: () => void
  /**
   * Entries a read-only stepper's contents list ends with, for other parts of
   * the host's page (such as a form to fill in below the one being read). Each
   * scrolls to the element with that id.
   */
  contentsLinks?: ContentsLink[]
}

export interface ContentsLink {
  label: string
  /** The id of the element on the page to scroll to. */
  targetId: string
}

export const FormStepsContext = createContext<FormStepsContextValue | null>(null)

export function useFormSteps(): FormStepsContextValue | null {
  return useContext(FormStepsContext)
}
