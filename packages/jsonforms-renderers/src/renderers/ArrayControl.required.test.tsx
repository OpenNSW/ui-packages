// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
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
    commodities: {
      type: 'array',
      title: 'Commodities List',
      items: {
        type: 'object',
        properties: { name: { type: 'string' } },
      },
    },
  },
  allOf: [
    {
      if: {
        properties: { reviewOutcome: { const: 'approve' } },
        required: ['reviewOutcome'],
      },
      then: { required: ['commodities'] },
    },
  ],
} as JsonSchema

const uischema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/reviewOutcome', options: { format: 'radio' } },
    { type: 'Control', scope: '#/properties/commodities' },
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

describe('ArrayControl conditional required (useIsRequired)', () => {
  it('shows a red asterisk only when the array is required through if/then', () => {
    renderForm({ reviewOutcome: 'reject', commodities: [] })
    const rejected = screen.getByText('Commodities List')
    expect(rejected.textContent).not.toContain('*')

    cleanup()
    renderForm({ reviewOutcome: 'approve', commodities: [] })
    const approved = screen.getByText('Commodities List')
    expect(approved.textContent).toContain('*')
  })

  it('keeps the asterisk when the conditionally required array already has items', () => {
    renderForm({ reviewOutcome: 'approve', commodities: [{ name: 'Tea' }] })
    const title = screen.getByText('Commodities List')
    expect(title.textContent).toContain('*')
  })
})
