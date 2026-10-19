// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import { FormStepsProvider } from '../contexts/FormStepsContext'
import type { FormStepState } from '../contexts/formSteps'
import type { ReactNode } from 'react'

afterEach(cleanup)

const schema: JsonSchema = {
  type: 'object',
  properties: {
    exporter: { type: 'string', title: 'Exporter name' },
    consignee: { type: 'string', title: 'Consignee name' },
    vessel: { type: 'string', title: 'Vessel name' },
    note: { type: 'string', title: 'Note' },
  },
  required: ['exporter', 'vessel'],
}

const control = (name: string) => ({ type: 'Control', scope: `#/properties/${name}` })

const stepper = () => ({
  type: 'Categorization',
  options: { variant: 'stepper' },
  elements: [
    { type: 'Category', label: 'Parties', elements: [control('exporter'), control('consignee')] },
    { type: 'Category', label: 'Transport', elements: [control('vessel'), control('note')] },
  ],
})

function Form({
  uischema,
  data,
  onStepChange,
  onInvalidStep,
  actions,
}: {
  uischema: unknown
  data: Record<string, unknown>
  onStepChange?: (s: FormStepState) => void
  onInvalidStep?: () => void
  actions?: ReactNode
}) {
  return (
    <Theme>
      <FormStepsProvider onStepChange={onStepChange} onInvalidStep={onInvalidStep} actions={actions}>
        <JsonForms schema={schema} uischema={uischema as UISchemaElement} data={data} renderers={radixRenderers} />
      </FormStepsProvider>
    </Theme>
  )
}

// Only the step on screen is visible; the others stay mounted but hidden.
const shownInput = (label: string) => {
  const input = screen.getByLabelText(label, { exact: false })
  return input.closest('[hidden]') === null
}

const continueButton = () => screen.getByRole('button', { name: 'Continue' })

describe('Categorization stepper', () => {
  it('shows one step at a time and keeps the others mounted', () => {
    render(<Form uischema={stepper()} data={{}} />)

    expect(shownInput('Exporter name')).toBe(true)
    expect(shownInput('Vessel name')).toBe(false)
    expect(screen.getByText('Step 1 of 3')).toBeTruthy()
  })

  it('refuses Continue while the step has missing fields, and names them', () => {
    const onInvalidStep = vi.fn()
    render(<Form uischema={stepper()} data={{}} onInvalidStep={onInvalidStep} />)

    fireEvent.click(continueButton())

    expect(shownInput('Exporter name')).toBe(true)
    expect(screen.getByText('Complete these fields to continue:')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Exporter name' })).toBeTruthy()
    // A field on another step is not this step's problem.
    expect(screen.queryByRole('button', { name: 'Vessel name' })).toBeNull()
    expect(onInvalidStep).toHaveBeenCalledOnce()
  })

  it('treats a required field typed into and cleared as missing', () => {
    render(<Form uischema={stepper()} data={{ exporter: '  ' }} />)

    fireEvent.click(continueButton())

    expect(screen.getByRole('button', { name: 'Exporter name' })).toBeTruthy()
  })

  it('moves on once the step is complete, and ends on a review step', () => {
    const steps: FormStepState[] = []
    render(<Form uischema={stepper()} data={{ exporter: 'A', vessel: 'V' }} onStepChange={(s) => steps.push(s)} />)

    fireEvent.click(continueButton())
    expect(shownInput('Vessel name')).toBe(true)
    expect(shownInput('Exporter name')).toBe(false)

    fireEvent.click(continueButton())
    expect(screen.getByText('Check your answers below, then submit.')).toBeTruthy()
    // Every step is shown read-only on the review step.
    expect(shownInput('Exporter name')).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>('Vessel name', { exact: false }).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()

    expect(steps.at(0)).toEqual({ step: 0, count: 2, last: false })
    expect(steps.at(-1)).toEqual({ step: 2, count: 2, last: true })
  })

  it('goes back to an earlier step from the review step', () => {
    render(<Form uischema={stepper()} data={{ exporter: 'A', vessel: 'V' }} />)
    fireEvent.click(continueButton())
    fireEvent.click(continueButton())

    fireEvent.click(screen.getByRole('button', { name: 'Edit Parties' }))

    expect(shownInput('Exporter name')).toBe(true)
    expect(shownInput('Vessel name')).toBe(false)
  })

  it('does not let the step list skip ahead of a step never checked', () => {
    render(<Form uischema={stepper()} data={{}} />)
    const nav = screen.getByRole('navigation', { name: 'Form steps' })
    const transport = Array.from(nav.querySelectorAll('button')).find((b) => b.textContent?.includes('Transport'))

    expect(transport?.disabled).toBe(true)
  })

  it('accepts data the host fills in after mount, as the auto-fill button does', () => {
    const { rerender } = render(<Form uischema={stepper()} data={{}} />)
    fireEvent.click(continueButton())
    expect(screen.getByText('Complete these fields to continue:')).toBeTruthy()

    act(() => {
      rerender(<Form uischema={stepper()} data={{ exporter: 'A', consignee: 'B', vessel: 'V' }} />)
    })
    fireEvent.click(continueButton())
    fireEvent.click(continueButton())

    expect(screen.getByText('Check your answers below, then submit.')).toBeTruthy()
  })

  it('notes each step in the list', () => {
    render(<Form uischema={stepper()} data={{ exporter: 'A', vessel: 'V' }} />)
    const nav = () => screen.getByRole('navigation', { name: 'Form steps' })

    expect(nav().textContent).toContain('2 fields')

    fireEvent.click(continueButton())

    expect(nav().textContent).toContain('Done')
  })

  it('counts what is left to fix on a step in the list', () => {
    render(<Form uischema={stepper()} data={{}} />)

    fireEvent.click(continueButton())

    const nav = screen.getByRole('navigation', { name: 'Form steps' })
    expect(nav.textContent).toContain('1 to fix')
    expect(screen.getByTestId('step-error-count').textContent).toBe('1')
  })

  it("shows the host's buttons in the footer on every step", () => {
    render(<Form uischema={stepper()} data={{ exporter: 'A', vessel: 'V' }} actions={<button>Save as draft</button>} />)

    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeTruthy()
    fireEvent.click(continueButton())
    fireEvent.click(continueButton())
    expect(screen.getByRole('button', { name: 'Save as draft' })).toBeTruthy()
  })

  it('scrolls to a newly chosen step, but not on mount', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    render(
      <StrictMode>
        <Form uischema={stepper()} data={{ exporter: 'A' }} />
      </StrictMode>,
    )
    expect(scroll).not.toHaveBeenCalled()

    fireEvent.click(continueButton())

    expect(scroll).toHaveBeenCalledOnce()
  })

  it('moves focus to the new step title on Continue', () => {
    render(<Form uischema={stepper()} data={{ exporter: 'A' }} />)

    fireEvent.click(continueButton())

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Transport' }))
  })

  it('opens the answered, complete steps of a saved draft in the step list', () => {
    render(<Form uischema={stepper()} data={{ exporter: 'A' }} />)
    const step = (name: string) =>
      Array.from(screen.getByRole('navigation', { name: 'Form steps' }).querySelectorAll('button')).find((b) =>
        b.textContent?.includes(name),
      )

    expect(step('Transport')?.disabled).toBe(false)
    expect(step('Review')?.disabled).toBe(true)
  })

  it('shows every step on one page when the form is read-only', () => {
    const steps: FormStepState[] = []
    render(
      <Theme>
        <FormStepsProvider onStepChange={(s) => steps.push(s)}>
          <JsonForms
            schema={schema}
            uischema={stepper() as UISchemaElement}
            data={{ exporter: 'A' }}
            renderers={radixRenderers}
            readonly
          />
        </FormStepsProvider>
      </Theme>,
    )

    expect(screen.getByRole('heading', { name: 'Parties' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Transport' })).toBeTruthy()
    expect(shownInput('Vessel name')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(steps.at(-1)).toEqual({ step: 2, count: 2, last: true })
  })

  it('still renders tabs without the stepper variant', () => {
    render(<Form uischema={{ ...stepper(), options: {} }} data={{}} />)

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
  })
})
