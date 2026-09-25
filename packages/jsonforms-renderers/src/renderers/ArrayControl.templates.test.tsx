// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

type Row = Record<string, unknown>
type Data = { order: { orderNo: string; lineItems: Row[] } }

afterEach(cleanup)

const schema = {
  type: 'object',
  properties: {
    order: {
      type: 'object',
      properties: {
        orderNo: { type: 'string' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lineRef: { type: 'string', readOnly: true, 'x-template': { template: '{orderNo}-{seq(2)}' } },
              receivedOn: { type: 'string', readOnly: true, 'x-template': { template: '{today(YYYYMMDD)}' } },
            },
          },
        },
      },
    },
  },
} as unknown as JsonSchema

const uischema = { type: 'Control', scope: '#/properties/order/properties/lineItems' } as UISchemaElement

/** Renders the form and returns a reader for the rows it last wrote. */
function renderForm(seed: Data) {
  const writes: Data[] = []

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
            writes.push(data as Data)
          }}
        />
      </Theme>
    )
  }

  render(<Harness />)
  return () => writes.at(-1)?.order.lineItems ?? []
}

const addRow = () => fireEvent.click(screen.getByRole('button', { name: /add item/i }))

describe('ArrayControl x-template', () => {
  // JSONForms debounces onChange, so each read of what it wrote waits for it.
  it('fills every template when a row is added, numbering on from the rows present', async () => {
    const rows = renderForm({
      order: { orderNo: 'ORD-77', lineItems: [{ lineRef: 'ORD-77-07', receivedOn: '20260504' }] },
    })

    addRow()
    addRow()
    await waitFor(() => {
      expect(rows().map((row) => row.lineRef)).toEqual(['ORD-77-07', 'ORD-77-08', 'ORD-77-09'])
    })
    expect(rows()[2].receivedOn).toMatch(/^\d{8}$/)

    const removes = screen.getAllByRole('button', { name: /remove/i })
    fireEvent.click(removes[removes.length - 1])
    addRow()
    await waitFor(() => {
      expect(rows().map((row) => row.lineRef)).toEqual(['ORD-77-07', 'ORD-77-08', 'ORD-77-10'])
    })
  })
})
