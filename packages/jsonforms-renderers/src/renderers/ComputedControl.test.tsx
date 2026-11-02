// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import type { ComputedFieldInput } from '../utils/computed'

type Data = Record<string, unknown>

afterEach(async () => {
  // JsonForms debounces onChange by 10ms. Flush it before jsdom is torn down.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  cleanup()
})

const uischema = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/total' }],
} as UISchemaElement

const schemaFor = (inputs: Record<string, ComputedFieldInput>) =>
  ({
    type: 'object',
    properties: {
      rows: { type: 'array', items: { type: 'object', properties: { amount: { type: 'number' } } } },
      total: { type: 'number', title: 'Total', 'x-computed': { inputs, formula: 'row_total' } },
    },
  }) as JsonSchema

// Renders the form and returns the data it last reported through onChange.
function renderForm(inputs: Record<string, ComputedFieldInput>, seed: Data) {
  const latest = { data: seed }
  // Built once: JsonForms re-initialises from `data` whenever the schema's identity changes.
  const schema = schemaFor(inputs)
  function Harness() {
    const [data, setData] = useState(seed)
    return (
      <Theme>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={data}
          renderers={radixRenderers}
          onChange={({ data: next }) => {
            latest.data = next as Data
            setData(next as Data)
          }}
        />
      </Theme>
    )
  }
  render(<Harness />)
  return latest
}

const rows = [{ amount: 100 }, { amount: 250 }]

describe('ComputedControl with an aggregate input', () => {
  it('shows the total and persists it', async () => {
    const latest = renderForm({ row_total: { path: 'rows.*.amount', aggregate: 'sum' } }, { rows })
    expect(await screen.findByText('350.00')).toBeTruthy()
    await waitFor(() => expect(latest.data.total).toBe(350))
  })

  it('shows a misconfigured input as an error and saves no value', async () => {
    const latest = renderForm({ row_total: 'rows.*.amount' }, { rows })
    expect(await screen.findByText('Input "row_total" has a * in its path but no aggregate.')).toBeTruthy()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(latest.data).not.toHaveProperty('total')
  })
})
