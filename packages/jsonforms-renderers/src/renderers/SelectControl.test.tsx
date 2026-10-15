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

// nor scrollIntoView, which Select.Content calls on the selected item when it opens
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
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

function renderForm(uischema: UISchemaElement, seed: Data, formSchema: JsonSchema = schema) {
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
          schema={formSchema}
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

  it('selects a match via keyboard: type a unique prefix, press Enter', async () => {
    const { writes } = renderForm(autocompleteUischema, {})

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'ind' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(writes[writes.length - 1]?.country).toBe('India')
    })
  })

  it('moves the highlight with ArrowDown/ArrowUp and selects the highlighted option on Enter', async () => {
    const { writes } = renderForm(autocompleteUischema, {})

    const input = screen.getByRole('textbox')
    fireEvent.focus(input) // opens with the full list: Sri Lanka, India, Maldives
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // -> India
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // -> Maldives
    fireEvent.keyDown(input, { key: 'ArrowUp' }) // -> India
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(writes[writes.length - 1]?.country).toBe('India')
    })
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

describe('SelectControl object-shaped field', () => {
  const objectSchema = {
    type: 'object',
    properties: {
      commodity: {
        type: 'object',
        title: 'Commodity',
        properties: {
          value: {
            type: 'string',
            oneOf: [
              { const: '7', title: 'Cinnamon quill' },
              { const: '8', title: 'Cinnamon leaf oil' },
            ],
          },
          label: { type: 'string' },
        },
        required: ['value'],
      },
    },
    required: ['commodity'],
  } as JsonSchema

  const plainUischema = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/commodity' }],
  } as UISchemaElement

  const autocompleteUischema = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/commodity', options: { autocomplete: true } }],
  } as UISchemaElement

  it('renders as a dropdown and stores { value, label } from the plain select', async () => {
    const { writes } = renderForm(plainUischema, {}, objectSchema)

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: 'Cinnamon quill' }))

    await waitFor(() => {
      expect(writes[writes.length - 1]?.commodity).toEqual({ value: '7', label: 'Cinnamon quill' })
    })
  })

  it('stores { value, label } from the autocomplete', async () => {
    const { writes } = renderForm(autocompleteUischema, {}, objectSchema)

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'leaf' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(writes[writes.length - 1]?.commodity).toEqual({ value: '8', label: 'Cinnamon leaf oil' })
    })
  })

  it('shows the stored label, not a title renamed since', () => {
    renderForm(autocompleteUischema, { commodity: { value: '7', label: 'Cinnamon quills' } }, objectSchema)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Cinnamon quills')
  })

  it('shows the stored label when its value is no longer an option', () => {
    renderForm(autocompleteUischema, { commodity: { value: '9', label: 'Cinnamon bark' } }, objectSchema)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Cinnamon bark')
  })

  it('shows the stored label in the plain dropdown', () => {
    renderForm(plainUischema, { commodity: { value: '9', label: 'Cinnamon bark' } }, objectSchema)
    expect(screen.getByRole('combobox').textContent).toContain('Cinnamon bark')
  })

  it('shows a legacy bare value saved before the field became an object', () => {
    renderForm(autocompleteUischema, { commodity: '8' }, objectSchema)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Cinnamon leaf oil')
  })

  it('clears the whole object', async () => {
    const { writes } = renderForm(
      autocompleteUischema,
      { commodity: { value: '7', label: 'Cinnamon quill' } },
      objectSchema,
    )

    fireEvent.click(screen.getByLabelText('Clear selection'))

    await waitFor(() => {
      expect(writes[writes.length - 1]?.commodity).toBeUndefined()
    })
  })

  it('reports a required field left empty', () => {
    renderForm(plainUischema, {}, objectSchema)
    expect(screen.getByText('Commodity is required')).toBeTruthy()
  })

  it('writes a non-string const as-is', async () => {
    const numericSchema = {
      type: 'object',
      properties: {
        grade: {
          type: 'object',
          properties: { value: { type: 'integer', enum: [1, 2] }, label: { type: 'string' } },
        },
      },
    } as JsonSchema
    const uischema = {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/grade', options: { autocomplete: true } }],
    } as UISchemaElement
    const { writes } = renderForm(uischema, {}, numericSchema)

    const input = screen.getByRole('textbox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(writes[writes.length - 1]?.grade).toEqual({ value: 2, label: '2' })
    })
  })
})
