import { createAjv } from '@jsonforms/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { withRelativeDates } from './ajvDates'

describe('withRelativeDates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 22, 12))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const schema = {
    type: 'string',
    format: 'date',
    formatMinimum: 'today',
  }

  it('treats formatMinimum today as the current local day', () => {
    const ajv = withRelativeDates(createAjv())
    const validate = ajv.compile(schema)

    expect(validate('2026-10-22')).toBe(true)
    expect(validate('2026-10-23')).toBe(true)
    expect(validate('2026-10-21')).toBe(false)
    expect(validate.errors?.[0]?.message).toBe('should be >= today')
  })

  it('keeps a fixed formatMinimum on the original compare', () => {
    const ajv = withRelativeDates(createAjv())
    const validate = ajv.compile({ type: 'string', format: 'date', formatMinimum: '2026-01-01' })

    expect(validate('2026-01-01')).toBe(true)
    expect(validate('2025-12-31')).toBe(false)
    expect(validate.errors?.[0]?.message).toBe('should be >= 2026-01-01')
  })

  it('compares a date-time to today by its calendar day', () => {
    const ajv = withRelativeDates(createAjv())
    const validate = ajv.compile({ type: 'string', format: 'date-time', formatMinimum: 'today' })

    expect(validate('2026-10-22T00:00:00+05:30')).toBe(true)
    expect(validate('2026-10-21T23:30:00+05:30')).toBe(false)
  })

  it('rejects every value when today is not taught', () => {
    const validate = createAjv().compile(schema)

    expect(validate('2026-10-23')).toBe(false)
  })
})