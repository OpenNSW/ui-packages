import type { ReactNode } from 'react'
import { FormStepsContext, type FormStepsContextValue } from './formSteps'

/** Gives a stepper form under it the host's callbacks and buttons (see formSteps.ts). */
export function FormStepsProvider({ children, ...value }: FormStepsContextValue & { children: ReactNode }) {
  return <FormStepsContext.Provider value={value}>{children}</FormStepsContext.Provider>
}
