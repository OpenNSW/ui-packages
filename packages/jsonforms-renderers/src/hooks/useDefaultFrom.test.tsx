// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from '../renderers'

type Data = Record<string, unknown>

const finishers: (() => void)[] = []

afterEach(async () => {
  for (const stop of finishers) stop()
  finishers.length = 0
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  cleanup()
})

function renderForm(schema: JsonSchema, uischema: UISchemaElement, seed: Data) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })

  function Harness() {
    const [initial] = useState(seed)
    return (
      <Theme>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={initial}
          renderers={radixRenderers}
          onChange={({ data }) => {
            if (!live) return
            writes.push(data as Data)
          }}
        />
      </Theme>
    )
  }

  render(<Harness />)
  return { latest: () => writes[writes.length - 1] }
}

const textSchema = {
  type: 'object',
  properties: {
    importing_country: { type: 'string', title: 'Importing Country' },
    consignee_country: { type: 'string', title: 'Consignee Country', 'x-defaultFrom': 'importing_country' },
  },
} as unknown as JsonSchema

const textUi = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/importing_country' },
    { type: 'Control', scope: '#/properties/consignee_country' },
  ],
} as UISchemaElement

const numberSchema = {
  type: 'object',
  properties: {
    quantity: { type: 'number', title: 'Quantity' },
    copies: { type: 'number', title: 'Copies', 'x-defaultFrom': 'quantity' },
  },
} as unknown as JsonSchema

const numberUi = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/quantity' },
    { type: 'Control', scope: '#/properties/copies' },
  ],
} as UISchemaElement

describe('x-defaultFrom', () => {
  it('copies a text sibling while empty, keeps an edit, then follows the sibling again', async () => {
    const { latest } = renderForm(textSchema, textUi, {})

    fireEvent.change(screen.getByLabelText(/Importing Country/), { target: { value: 'GB' } })
    await waitFor(() => {
      expect(latest()?.importing_country).toBe('GB')
      expect(latest()?.consignee_country).toBe('GB')
    })

    fireEvent.change(screen.getByLabelText(/Consignee Country/), { target: { value: 'US' } })
    await waitFor(() => {
      expect(latest()?.consignee_country).toBe('US')
      expect(latest()?.importing_country).toBe('GB')
    })

    fireEvent.change(screen.getByLabelText(/Importing Country/), { target: { value: 'AU' } })
    await waitFor(() => {
      expect(latest()?.importing_country).toBe('AU')
      expect(latest()?.consignee_country).toBe('AU')
    })
  })

  it('clears the text field when the sibling is cleared', async () => {
    const { latest } = renderForm(textSchema, textUi, { importing_country: 'GB', consignee_country: 'US' })

    fireEvent.change(screen.getByLabelText(/Importing Country/), { target: { value: '' } })
    await waitFor(() => {
      expect(latest()?.importing_country).toBeUndefined()
      expect(latest()?.consignee_country).toBeUndefined()
    })
  })

  it('copies a number, including zero', async () => {
    const { latest } = renderForm(numberSchema, numberUi, {})

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: '0' } })
    await waitFor(() => {
      expect(latest()?.quantity).toBe(0)
      expect(latest()?.copies).toBe(0)
    })
  })
})
