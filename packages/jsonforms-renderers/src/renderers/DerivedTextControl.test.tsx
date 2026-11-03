// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

type Data = Record<string, unknown>

const flush = () =>
  act(async () => {
    // JsonForms debounces onChange by 10ms.
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

afterEach(async () => {
  await flush()
  cleanup()
})

const uischema = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/info' }],
} as UISchemaElement

const schemaFor = (xText: Record<string, unknown>) =>
  ({
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            treatment: { type: 'string', oneOf: [{ const: 'FUM', title: 'Fumigation' }] },
          },
        },
      },
      info: { type: 'string', title: 'Additional information', 'x-text': xText },
    },
  }) as JsonSchema

// One line per treated item.
const X_TEXT = {
  inputs: {
    lines: { path: 'items.*', aggregate: 'join', where: 'treatment', template: '{name}: {treatment}', separator: '\n' },
  },
  template: '{lines}',
}

// Renders the form and returns the data it last reported, plus a way to replace the data.
function renderForm(xText: Record<string, unknown>, seed: Data, readonly = false) {
  const latest: { data: Data; set: (data: Data) => void } = { data: seed, set: () => {} }
  const schema = schemaFor(xText)
  function Harness() {
    const [data, setData] = useState(seed)
    latest.set = setData
    return (
      <Theme>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={data}
          readonly={readonly}
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

const items = [{ name: 'Tea', treatment: 'FUM' }, { name: 'Pepper' }]

describe('DerivedTextControl, read-only', () => {
  it('shows and saves the text, and follows the items', async () => {
    const latest = renderForm(X_TEXT, { items })
    expect(await screen.findByText('Tea: Fumigation')).toBeTruthy()
    await waitFor(() => expect(latest.data.info).toBe('Tea: Fumigation'))

    act(() => latest.set({ ...latest.data, items: [...items, { name: 'Clove', treatment: 'FUM' }] }))
    await waitFor(() => expect(latest.data.info).toBe('Tea: Fumigation\nClove: Fumigation'))
  })

  it('saves no value when the template gives no text', async () => {
    const latest = renderForm(X_TEXT, { info: 'stale' })
    expect(await screen.findByText('None.')).toBeTruthy()
    await waitFor(() => expect(latest.data).not.toHaveProperty('info'))
  })

  it('shows a misconfigured input and clears the saved text', async () => {
    const bad = { inputs: { lines: { path: 'items.*', aggregate: 'join', skip: -1 } }, template: '{lines}' }
    const latest = renderForm(bad, { info: 'old' })
    expect(await screen.findByText('Input "lines" has a skip -1 that isn\'t a whole number of 0 or more.')).toBeTruthy()
    await waitFor(() => expect(latest.data).not.toHaveProperty('info'))
  })

  it('does not rewrite a form that is read-only as a whole', async () => {
    const latest = renderForm(X_TEXT, { items, info: 'saved' }, true)
    expect(await screen.findByText('Tea: Fumigation')).toBeTruthy()
    await flush()
    expect(latest.data.info).toBe('saved')
  })
})

describe('DerivedTextControl, editable', () => {
  const editable = { ...X_TEXT, editable: true }

  it('fills an empty field', async () => {
    const latest = renderForm(editable, { items })
    await waitFor(() => expect(latest.data.info).toBe('Tea: Fumigation'))
    expect(screen.getByLabelText<HTMLTextAreaElement>(/Additional information/).value).toBe('Tea: Fumigation')
  })

  it("leaves the user's text alone when the items change", async () => {
    const latest = renderForm(editable, { items })
    await waitFor(() => expect(latest.data.info).toBe('Tea: Fumigation'))

    fireEvent.change(screen.getByLabelText(/Additional information/), { target: { value: 'Tea: re-fumigated' } })
    await waitFor(() => expect(latest.data.info).toBe('Tea: re-fumigated'))

    act(() => latest.set({ ...latest.data, items: [...items, { name: 'Clove', treatment: 'FUM' }] }))
    await flush()
    expect(latest.data.info).toBe('Tea: re-fumigated')
  })

  it('stays empty when the user clears the field, and when the form is reopened', async () => {
    const latest = renderForm(editable, { items })
    await waitFor(() => expect(latest.data.info).toBe('Tea: Fumigation'))

    fireEvent.change(screen.getByLabelText(/Additional information/), { target: { value: '' } })
    await waitFor(() => expect(latest.data.info).toBe(''))
    await flush()
    expect(latest.data.info).toBe('')

    cleanup()
    const reopened = renderForm(editable, { items, info: '' })
    await flush()
    expect(reopened.data.info).toBe('')
  })

  it('does not fill a field in a form that is read-only as a whole', async () => {
    const latest = renderForm(editable, { items }, true)
    await flush()
    expect(latest.data).not.toHaveProperty('info')
  })
})
