// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import { createAjv, type JsonSchema, type UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import { localISODate } from './DateControl'
import { withRelativeDates } from '../utils/ajvDates'

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

function renderForm(schema: JsonSchema, uischema: UISchemaElement, seed: Data, ajv?: ReturnType<typeof createAjv>) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })

  function Harness() {
    const [data, setData] = useState(seed)
    return (
      <Theme>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={data}
          renderers={radixRenderers}
          ajv={ajv}
          onChange={({ data: next }) => {
            if (!live) return
            const row = next as Data
            writes.push(row)
            setData(row)
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

const shipmentSchema = {
  type: 'object',
  properties: {
    estimated_shipment_date: {
      type: 'string',
      format: 'date',
      title: 'Estimated Shipment Date',
      formatMinimum: 'today',
    },
  },
} as JsonSchema

const openShipmentSchema: JsonSchema = {
  type: 'object',
  properties: {
    estimated_shipment_date: { type: 'string', format: 'date', title: 'Estimated Shipment Date' },
  },
}

const shipmentControl = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/estimated_shipment_date' }],
} as UISchemaElement

const showDateSchema: JsonSchema = {
  type: 'object',
  properties: {
    showDate: { type: 'boolean', title: 'Show date' },
    estimated_shipment_date: { type: 'string', format: 'date', title: 'Estimated Shipment Date' },
  },
}

const showDateControl = {
  type: 'VerticalLayout',
  elements: [
    {
      type: 'Control',
      scope: '#/properties/estimated_shipment_date',
      rule: {
        effect: 'SHOW',
        condition: {
          scope: '#/properties/showDate',
          schema: { const: true },
        },
      },
    },
  ],
} as UISchemaElement

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localISODate(d)
}

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

describe('DateControl no past days', () => {
  const ajv = withRelativeDates(createAjv())

  beforeEach(() => {
    // Date is frozen at 22 Oct 2026. shouldAdvanceTime lets JsonForms' debounced
    // onChange still fire; faking Date alone never lets that 10ms debounce elapse.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 22, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets the picker minimum to the current day and keeps that day', async () => {
    const today = localISODate()
    const { writes } = renderForm(shipmentSchema, shipmentControl, {}, ajv)
    const input = screen.getByLabelText(/Estimated Shipment Date/)

    expect(today).toBe('2026-10-22')
    expect(input.getAttribute('min')).toBe(today)

    fireEvent.change(input, { target: { value: today } })
    await waitFor(() => {
      expect(writes.at(-1)).toEqual({ estimated_shipment_date: today })
    })
    expect(screen.queryByText(/must be today or later/)).toBeNull()
  })

  it('keeps each typed year digit', async () => {
    const { writes } = renderForm(shipmentSchema, shipmentControl, {}, ajv)
    const input = screen.getByLabelText(/Estimated Shipment Date/)

    for (const value of ['0002-11-01', '0020-11-01', '0202-11-01', '2026-11-01']) {
      fireEvent.change(input, { target: { value } })
      await waitFor(() => {
        expect(writes.at(-1)).toEqual({ estimated_shipment_date: value })
      })
      expect((input as HTMLInputElement).value).toBe(value)
    }
  })

  it('stores a past day and reports it as an error', async () => {
    renderForm(shipmentSchema, shipmentControl, { estimated_shipment_date: '2020-01-01' }, ajv)
    const input = screen.getByLabelText(/Estimated Shipment Date/) as HTMLInputElement

    expect(input.value).toBe('2020-01-01')
    expect(screen.getByText('Estimated Shipment Date must be today or later')).toBeTruthy()
  })

  it('still stores a past date when the schema sets no minimum', async () => {
    const yesterday = daysAgo(1)
    const { writes } = renderForm(openShipmentSchema, shipmentControl, {}, ajv)
    const input = screen.getByLabelText(/Estimated Shipment Date/)

    expect(yesterday).toBe('2026-10-21')
    expect(input.getAttribute('min')).toBeNull()
    fireEvent.change(input, { target: { value: yesterday } })
    await waitFor(() => {
      expect(writes.at(-1)).toEqual({ estimated_shipment_date: yesterday })
    })
    expect(screen.queryByText(/must be today or later/)).toBeNull()
  })
})

describe('DateControl visibility', () => {
  it('shows a date field that a rule hid', () => {
    function Harness() {
      const [data, setData] = useState<Data>({ showDate: false })
      return (
        <Theme>
          <button type="button" onClick={() => setData((current) => ({ ...current, showDate: true }))}>
            Show date
          </button>
          <JsonForms schema={showDateSchema} uischema={showDateControl} data={data} renderers={radixRenderers} />
        </Theme>
      )
    }

    render(<Harness />)
    expect(screen.queryByLabelText(/Estimated Shipment Date/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show date' }))

    expect(screen.getByLabelText(/Estimated Shipment Date/)).toBeTruthy()
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
