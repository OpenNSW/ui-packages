// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import { timeInputValue, toRfc3339Time } from './DateControl'

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
    openingTime: { type: 'string', format: 'time', title: 'Opening Time' },
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

const timeControl = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/openingTime' }],
} as UISchemaElement

const secondsControl = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/openingTime', options: { showSeconds: true } }],
} as UISchemaElement

describe('toRfc3339Time', () => {
  it('pads HH:MM with zero seconds', () => {
    expect(toRfc3339Time('14:30')).toBe('14:30:00')
  })

  it('leaves HH:MM:SS unchanged', () => {
    expect(toRfc3339Time('14:30:45')).toBe('14:30:45')
  })

  it('clears an empty picker value', () => {
    expect(toRfc3339Time('')).toBeUndefined()
  })
})

describe('timeInputValue', () => {
  it('drops seconds when the seconds spinner is off', () => {
    expect(timeInputValue('14:30:00', false)).toBe('14:30')
  })

  it('keeps seconds when the seconds spinner is on', () => {
    expect(timeInputValue('14:30:45', true)).toBe('14:30:45')
  })

  it('fills missing seconds for the seconds spinner', () => {
    expect(timeInputValue('14:30', true)).toBe('14:30:00')
  })
})

describe('DateControl time', () => {
  it('stores HH:MM:SS when the picker emits HH:MM', async () => {
    const { writes } = renderForm(timeControl, {})
    const input = screen.getByLabelText(/Opening Time/)

    fireEvent.change(input, { target: { value: '14:30' } })

    await waitFor(() => {
      expect(writes.at(-1)).toEqual({ openingTime: '14:30:00' })
    })
  })

  it('uses minute step unless showSeconds is set', () => {
    renderForm(timeControl, { openingTime: '14:30:00' })
    expect(screen.getByLabelText(/Opening Time/).getAttribute('step')).toBe('60')
    expect((screen.getByLabelText(/Opening Time/) as HTMLInputElement).value).toBe('14:30')
  })

  it('shows a seconds spinner when showSeconds is true', async () => {
    const { writes } = renderForm(secondsControl, {})
    const input = screen.getByLabelText(/Opening Time/)

    expect(input.getAttribute('step')).toBe('1')

    fireEvent.change(input, { target: { value: '14:30' } })
    await waitFor(() => {
      expect(writes.at(-1)).toEqual({ openingTime: '14:30:00' })
    })

    fireEvent.change(input, { target: { value: '14:30:45' } })
    await waitFor(() => {
      expect(writes.at(-1)).toEqual({ openingTime: '14:30:45' })
    })
  })
})
