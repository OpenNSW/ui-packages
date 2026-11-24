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
    expect(resolveFormatDay('2026-02-31')).toBeUndefined()
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

  it('shifts exclusive bounds across month ends in local time', () => {
    expect(
      datePickerBounds({
        format: 'date',
        formatExclusiveMinimum: '2026-01-31',
        formatExclusiveMaximum: '2026-03-01',
      }),
    ).toEqual({ min: '2026-02-01', max: '2026-02-28' })
  })

  it('keeps the stricter day when inclusive and exclusive are both set', () => {
    expect(
      datePickerBounds({
        format: 'date',
        formatMinimum: '2026-01-01',
        formatExclusiveMinimum: '2026-01-10',
        formatMaximum: '2026-12-31',
        formatExclusiveMaximum: '2026-12-20',
      }),
    ).toEqual({ min: '2026-01-11', max: '2026-12-19' })
  })

  it('ignores non-string limits such as $data refs', () => {
    expect(
      datePickerBounds({
        format: 'date',
        formatMaximum: { $data: '1/other' },
      }),
    ).toEqual({})
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
