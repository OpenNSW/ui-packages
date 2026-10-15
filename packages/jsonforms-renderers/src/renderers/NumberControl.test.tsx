// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

type Data = Record<string, unknown>

afterEach(async () => {
  // JsonForms debounces onChange by 10ms. Flush it before jsdom is torn down.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  cleanup()
})

const schema = {
  type: 'object',
  properties: {
    reviewOutcome: {
      type: 'string',
      title: 'Review Outcome',
      oneOf: [
        { const: 'approve', title: 'Approve' },
        { const: 'reject', title: 'Reject' },
      ],
    },
    assessedAmount: {
      type: 'number',
      title: 'Assessed Amount',
      exclusiveMinimum: 0,
      multipleOf: 0.01,
    },
  },
  allOf: [
    {
      if: {
        properties: { reviewOutcome: { const: 'approve' } },
        required: ['reviewOutcome'],
      },
      then: { required: ['assessedAmount'] },
    },
  ],
} as JsonSchema

const uischema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/reviewOutcome', options: { format: 'radio' } },
    {
      type: 'Control',
      scope: '#/properties/assessedAmount',
      rule: {
        effect: 'SHOW',
        condition: {
          scope: '#/properties/reviewOutcome',
          schema: { const: 'approve' },
        },
      },
    },
  ],
} as UISchemaElement

function renderForm(seed: Data) {
  function Harness() {
    const [data, setData] = useState(seed)
    return (
      <Theme>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={data}
          renderers={radixRenderers}
          onChange={({ data: next }) => setData(next as Data)}
        />
      </Theme>
    )
  }
  return render(<Harness />)
}

describe('NumberControl required asterisk', () => {
  it('shows a red asterisk only when the amount is conditionally required', () => {
    renderForm({ reviewOutcome: 'reject' })
    expect(screen.queryByText('Assessed Amount')).toBeNull()

    cleanup()
    renderForm({ reviewOutcome: 'approve' })
    const label = screen.getByText('Assessed Amount')
    expect(label.textContent).toContain('*')
  })

  it('sets min from exclusiveMinimum and blocks signed / exponent keys and pastes', () => {
    renderForm({ reviewOutcome: 'approve' })
    const input = screen.getByLabelText(/Assessed Amount/) as HTMLInputElement
    expect(input).toHaveProperty('type', 'number')
    expect(input.min).toBe('0')
    expect(input.step).toBe('0.01')

    // jsdom does not type on keydown; fireEvent returns false when preventDefault ran.
    expect(fireEvent.keyDown(input, { key: '-' })).toBe(false)
    expect(fireEvent.keyDown(input, { key: '+' })).toBe(false)
    expect(fireEvent.keyDown(input, { key: 'e' })).toBe(false)
    expect(fireEvent.keyDown(input, { key: '5' })).toBe(true)
    expect(fireEvent.paste(input, { clipboardData: { getData: () => '-5' } })).toBe(false)
    expect(fireEvent.paste(input, { clipboardData: { getData: () => '5.25' } })).toBe(true)
  })
})
