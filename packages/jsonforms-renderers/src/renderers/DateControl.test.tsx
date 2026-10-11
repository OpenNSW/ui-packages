// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

type Data = Record<string, unknown>

const finishers: (() => void)[] = []

afterEach(() => {
  for (const stop of finishers) stop()
  finishers.length = 0
  cleanup()
})

const openingTimeSchema: JsonSchema = {
  type: 'object',
  properties: {
    openingTime: { type: 'string', format: 'time', title: 'Opening Time' },
  },
}

const appointmentSchema: JsonSchema = {
  type: 'object',
  properties: {
    appointment: { type: 'string', format: 'date-time', title: 'Appointment' },
  },
}

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

const appointmentControl = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/appointment' }],
} as UISchemaElement

const appointmentSecondsControl = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/appointment', options: { showSeconds: true } }],
} as UISchemaElement

describe('DateControl time', () => {
  it('stores HH:MM:SS when the picker emits HH:MM', async () => {
    const { writes } = renderForm(openingTimeSchema, timeControl, {})
    const input = screen.getByLabelText(/Opening Time/)

    fireEvent.change(input, { target: { value: '14:30' } })

    await waitFor(() => {
      expect(writes.at(-1)).toEqual({ openingTime: '14:30:00' })
    })
  })

  it('clears the time when the picker value is empty', async () => {
    const { writes } = renderForm(openingTimeSchema, timeControl, { openingTime: '14:30:00' })
    const input = screen.getByLabelText(/Opening Time/)

    fireEvent.change(input, { target: { value: '' } })

    await waitFor(() => {
      expect(writes.at(-1)?.openingTime).toBeUndefined()
    })
  })

  it('uses minute step unless showSeconds is set', () => {
    renderForm(openingTimeSchema, timeControl, { openingTime: '14:30:00' })
    expect(screen.getByLabelText(/Opening Time/).getAttribute('step')).toBe('60')
    expect((screen.getByLabelText(/Opening Time/) as HTMLInputElement).value).toBe('14:30')
  })

  it('shows a seconds spinner when showSeconds is true', async () => {
    const { writes } = renderForm(openingTimeSchema, secondsControl, {})
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

describe('DateControl date-time', () => {
  it('uses minute step on the time input unless showSeconds is set', () => {
    renderForm(appointmentSchema, appointmentControl, { appointment: '2026-10-09T14:30:00' })
    const timeInput = document.querySelector('input[type="time"]')
    expect(timeInput?.getAttribute('step')).toBe('60')
    expect((timeInput as HTMLInputElement).value).toBe('14:30')
  })

  it('shows a seconds spinner on date-time when showSeconds is true', () => {
    renderForm(appointmentSchema, appointmentSecondsControl, { appointment: '2026-10-09T14:30:45' })
    const timeInput = document.querySelector('input[type="time"]')
    expect(timeInput?.getAttribute('step')).toBe('1')
    expect((timeInput as HTMLInputElement).value).toBe('14:30:45')
  })
})
