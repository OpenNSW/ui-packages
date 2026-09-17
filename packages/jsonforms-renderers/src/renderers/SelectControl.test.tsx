// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

// jsdom has no ResizeObserver; Radix's Select.Content mounts one via its internal ScrollArea
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

type Data = Record<string, unknown>

const finishers: (() => void)[] = []

afterEach(() => {
  for (const stop of finishers) stop()
  finishers.length = 0
  cleanup()
})

const schema: JsonSchema = {
  type: 'object',
  properties: {
    country: { type: 'string', enum: ['Sri Lanka', 'India', 'Maldives'] },
  },
}

function renderForm(uischema: UISchemaElement, seed: Data) {
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
            if (live) writes.push(data as Data)
          }}
        />
      </Theme>
    )
  }

  render(<Harness />)
  return { writes }
}

describe('SelectControl autocomplete', () => {
  const autocompleteUischema = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/country', options: { autocomplete: true } }],
  } as UISchemaElement

  it('filters options as the user types and commits the selected value', async () => {
    const { writes } = renderForm(autocompleteUischema, {})

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ind' } })

    expect(screen.getByText('India')).toBeTruthy()
    expect(screen.queryByText('Sri Lanka')).toBeNull()

    fireEvent.click(screen.getByText('India'))

    await waitFor(() => {
      expect(writes[writes.length - 1]?.country).toBe('India')
    })
  })

  it('shows the current value label when closed', () => {
    renderForm(autocompleteUischema, { country: 'Maldives' })

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('Maldives')
  })

  it('clears the value via the clear button', async () => {
    const { writes } = renderForm(autocompleteUischema, { country: 'Maldives' })

    fireEvent.click(screen.getByLabelText('Clear selection'))

    await waitFor(() => {
      expect(writes[writes.length - 1]?.country).toBeUndefined()
    })
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })

  it('does not show a clear button when there is no value', () => {
    renderForm(autocompleteUischema, {})
    expect(screen.queryByLabelText('Clear selection')).toBeNull()
  })

  it('falls back to the plain dropdown when options.autocomplete is not set', () => {
    const plainUischema = {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/country' }],
    } as UISchemaElement

    renderForm(plainUischema, {})

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('combobox')).toBeTruthy()
  })
})
