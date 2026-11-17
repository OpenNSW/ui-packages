import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { datePickerBounds, localISODate, resolveFormatDay } from './localDate'

describe('localDate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 22, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats the current local day', () => {
    expect(localISODate()).toBe('2026-10-22')
  })

  it('resolves today and fixed dates to YYYY-MM-DD', () => {
    expect(resolveFormatDay('today')).toBe('2026-10-22')
    expect(resolveFormatDay('2026-01-01')).toBe('2026-01-01')
    expect(resolveFormatDay('2026-01-01T12:30:00+05:30')).toBe('2026-01-01')
    expect(resolveFormatDay('not-a-date')).toBeUndefined()
  })

  it('sets picker min and max from inclusive format limits', () => {
    expect(
      datePickerBounds({
        format: 'date',
        formatMinimum: 'today',
        formatMaximum: '2026-12-31',
      }),
    ).toEqual({ min: '2026-10-22', max: '2026-12-31' })
  })

  it('moves exclusive format limits by one day', () => {
    expect(
      datePickerBounds({
        format: 'date',
        formatExclusiveMinimum: 'today',
        formatExclusiveMaximum: '2026-12-31',
      }),
    ).toEqual({ min: '2026-10-23', max: '2026-12-30' })
  })

  it('leaves time-only fields without day bounds', () => {
    expect(
      datePickerBounds({
        format: 'time',
        formatMinimum: 'today',
        formatMaximum: '2026-12-31',
      }),
    ).toEqual({})
  })
})
