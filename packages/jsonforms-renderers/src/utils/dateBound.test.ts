import { createAjv } from '@jsonforms/core'
import { describe, expect, it } from 'vitest'
import { addDateBounds, localISODate } from './dateBound'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localISODate(d)
}

describe('addDateBounds', () => {
  const validate = addDateBounds(createAjv()).compile({
    type: 'string',
    format: 'date',
    formatMinimum: 'today',
  })

  it('rejects a past day and accepts today', () => {
    expect(validate(daysAgo(1))).toBe(false)
    expect(validate.errors?.[0]?.message).toBe('should be >= today')
    expect(validate(localISODate())).toBe(true)
  })

  it('accepts a date-time any time today', () => {
    const dateTime = addDateBounds(createAjv()).compile({
      type: 'string',
      format: 'date-time',
      formatMinimum: 'today',
    })
    expect(dateTime(`${localISODate()}T00:30:00+05:30`)).toBe(true)
    expect(dateTime(`${daysAgo(1)}T23:30:00+05:30`)).toBe(false)
  })
})
