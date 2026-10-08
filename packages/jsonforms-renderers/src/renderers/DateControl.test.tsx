// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { ErrorObject, JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import { collectNotLaterThanErrors } from '../utils/notLaterThan'

afterEach(() => {
  cleanup()
})

const schema = {
  type: 'object',
  properties: {
    date_of_containerization: {
      type: 'string',
      format: 'date',
      title: 'Date of Containerization',
      'x-notLaterThan': 'date_of_sailing',
    },
    date_of_sailing: { type: 'string', format: 'date', title: 'Date of Sailing' },
  },
} as unknown as JsonSchema

const uischema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/date_of_containerization' },
    { type: 'Control', scope: '#/properties/date_of_sailing' },
  ],
} as UISchemaElement

function renderForm(
  seed: Record<string, unknown>,
  additionalErrors?: ErrorObject[],
  validationMode: 'ValidateAndShow' | 'ValidateAndHide' | 'NoValidation' = 'ValidateAndShow',
) {
  function Harness() {
    const [data, setData] = useState(seed)
    return (
      <Theme>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={data}
          renderers={radixRenderers}
          additionalErrors={additionalErrors}
          validationMode={validationMode}
          onChange={({ data: next }) => setData(next as Record<string, unknown>)}
        />
      </Theme>
    )
  }
  return render(<Harness />)
}

describe('DateControl x-notLaterThan', () => {
  it('shows the order error and clears it when the sibling moves later', async () => {
    renderForm({ date_of_containerization: '2026-06-20', date_of_sailing: '2026-06-12' })

    expect(await screen.findByText('Date of Containerization cannot be later than Date of Sailing')).toBeTruthy()

    const sailing = document.getElementById('date_of_sailing') as HTMLInputElement
    fireEvent.change(sailing, { target: { value: '2026-06-25' } })

    await waitFor(() => {
      expect(screen.queryByText('Date of Containerization cannot be later than Date of Sailing')).toBeNull()
    })
  })

  it('shows the order error only once when additionalErrors is also passed', async () => {
    const additionalErrors = collectNotLaterThanErrors(schema, {
      date_of_containerization: '2026-06-20',
      date_of_sailing: '2026-06-12',
    }) as unknown as ErrorObject[]

    renderForm({ date_of_containerization: '2026-06-20', date_of_sailing: '2026-06-12' }, additionalErrors)

    const matches = await screen.findAllByText('Date of Containerization cannot be later than Date of Sailing')
    expect(matches).toHaveLength(1)
  })

  it('hides the order error when validationMode is ValidateAndHide', () => {
    renderForm(
      { date_of_containerization: '2026-06-20', date_of_sailing: '2026-06-12' },
      undefined,
      'ValidateAndHide',
    )
    expect(screen.queryByText('Date of Containerization cannot be later than Date of Sailing')).toBeNull()
  })
})
