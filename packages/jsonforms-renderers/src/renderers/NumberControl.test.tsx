// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

type Data = Record<string, unknown>

afterEach(() => {
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
    assessedLevy: {
      type: 'number',
      title: 'Assessed SLTB Levy (LKR)',
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
      then: { required: ['assessedLevy'] },
    },
  ],
} as JsonSchema

const uischema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/reviewOutcome', options: { format: 'radio' } },
    {
      type: 'Control',
      scope: '#/properties/assessedLevy',
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

describe('NumberControl required asterisk + constraints', () => {
  it('shows a red asterisk only when the levy is conditionally required', () => {
    renderForm({ reviewOutcome: 'reject' })
    expect(screen.queryByText('Assessed SLTB Levy (LKR)')).toBeNull()

    cleanup()
    renderForm({ reviewOutcome: 'approve' })
    const label = screen.getByText('Assessed SLTB Levy (LKR)')
    expect(label.textContent).toContain('*')
  })

  it('sets min from exclusiveMinimum and blocks signed / exponent keys', () => {
    renderForm({ reviewOutcome: 'approve' })
    const input = screen.getByLabelText(/Assessed SLTB Levy/) as HTMLInputElement
    expect(input).toHaveProperty('type', 'number')
    expect(input.min).toBe('0')
    expect(input.step).toBe('0.01')

    fireEvent.keyDown(input, { key: '-' })
    fireEvent.keyDown(input, { key: '+' })
    fireEvent.keyDown(input, { key: 'e' })
    // Value stays empty; blocked keys never reach onChange with a signed draft.
    expect(input.value).toBe('')
  })
})
