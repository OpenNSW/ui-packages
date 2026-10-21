// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { useState } from 'react'
import { radixRenderers } from './index'

afterEach(cleanup)

// Radix's dialogs measure themselves with ResizeObserver, which jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

type Row = { grade?: string; bags?: number; kg?: number }
type Data = { rows: Row[] }

const schema: JsonSchema = {
  type: 'object',
  properties: {
    rows: {
      type: 'array',
      title: 'DC Grades',
      items: {
        type: 'object',
        required: ['grade'],
        properties: {
          grade: {
            type: 'string',
            title: 'Grade',
            oneOf: [
              { const: 'FINE', title: 'Fine' },
              { const: 'MEDIUM', title: 'Medium' },
            ],
          },
          bags: { type: 'number', title: 'Bags' },
          kg: { type: 'number', title: 'Weight' },
        },
      },
    },
  },
}

const control = (options: Record<string, unknown> = {}) =>
  ({ type: 'Control', scope: '#/properties/rows', options }) as UISchemaElement

function renderList(seed: Data, uischema: UISchemaElement, readonly = false) {
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
          readonly={readonly}
          onChange={({ data }) => writes.push(data as Data)}
        />
      </Theme>
    )
  }
  render(<Harness />)
  return () => writes.at(-1)?.rows ?? []
}

const two: Data = {
  rows: [
    { grade: 'FINE', bags: 500, kg: 12500 },
    { grade: 'MEDIUM', bags: 240, kg: 6000 },
  ],
}

describe('removing a list item', () => {
  it('asks first, naming the item, and keeps it when the trader chooses Keep item', async () => {
    const rows = renderList(two, control())

    fireEvent.click(screen.getByRole('button', { name: 'Remove Item 2' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Remove Item 2?')).toBeTruthy()
    // Focus starts on the safe choice.
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep item' }))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep item' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(rows()).toHaveLength(2)
  })

  it('removes it on Remove item, says so, and moves focus to the item now in its place', async () => {
    const rows = renderList({ rows: [...two.rows, { grade: 'FINE', bags: 1, kg: 25 }] }, control())

    fireEvent.click(screen.getByRole('button', { name: 'Remove Item 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }))

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.getByRole('status').textContent).toBe('Item 2 removed.')
    await waitFor(() => expect(document.activeElement?.textContent).toContain('Item 2'))
  })
})
