import { describe, expect, it } from 'vitest'
import {
  collectNotLaterThanErrors,
  isLaterThan,
  notLaterThanControlError,
  notLaterThanMessage,
  resolveSiblingValue,
} from './notLaterThan'

describe('isLaterThan', () => {
  it('is true when left is after right for plain dates', () => {
    expect(isLaterThan('2026-06-20', '2026-06-12')).toBe(true)
  })

  it('is false when equal or earlier', () => {
    expect(isLaterThan('2026-06-12', '2026-06-12')).toBe(false)
    expect(isLaterThan('2026-06-11', '2026-06-12')).toBe(false)
  })

  it('compares date-times, not only lexical strings', () => {
    expect(isLaterThan('2026-06-12T18:00:00+05:30', '2026-06-12T08:00:00+05:30')).toBe(true)
  })
})

describe('resolveSiblingValue', () => {
  it('reads a top-level sibling', () => {
    expect(resolveSiblingValue({ a: '1', b: '2' }, 'a', 'b')).toBe('2')
  })

  it('reads a sibling under the same parent object', () => {
    expect(resolveSiblingValue({ nest: { a: '1', b: '2' } }, 'nest.a', 'b')).toBe('2')
  })
})

describe('notLaterThanControlError', () => {
  it('returns the title message when the control is later than its sibling', () => {
    const err = notLaterThanControlError(
      { date_of_containerization: '2026-06-20', date_of_sailing: '2026-06-12' },
      'date_of_containerization',
      '2026-06-20',
      { type: 'string', format: 'date', 'x-notLaterThan': 'date_of_sailing' },
      'Date of Containerization',
    )
    expect(err).toBe(notLaterThanMessage('Date of Containerization', 'date_of_sailing'))
  })

  it('returns undefined when the order is valid or a side is empty', () => {
    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-11', date_of_sailing: '2026-06-12' },
        'date_of_containerization',
        '2026-06-11',
        { type: 'string', format: 'date', 'x-notLaterThan': 'date_of_sailing' },
        'Date of Containerization',
      ),
    ).toBeUndefined()
    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-20' },
        'date_of_containerization',
        '2026-06-20',
        { type: 'string', format: 'date', 'x-notLaterThan': 'date_of_sailing' },
        'Date of Containerization',
      ),
    ).toBeUndefined()
  })
})

describe('collectNotLaterThanErrors', () => {
  it('emits an AJV-shaped error with field titles', () => {
    const errors = collectNotLaterThanErrors(
      {
        type: 'object',
        properties: {
          date_of_containerization: {
            type: 'string',
            format: 'date',
            title: 'Date of Containerization',
            'x-notLaterThan': 'date_of_sailing',
          },
          date_of_sailing: { type: 'string', format: 'date', title: 'Date of Sailing' },
        },
      },
      { date_of_containerization: '2026-06-20', date_of_sailing: '2026-06-12' },
    )
    expect(errors).toEqual([
      {
        instancePath: '/date_of_containerization',
        schemaPath: '#/properties/date_of_containerization/x-notLaterThan',
        keyword: 'x-notLaterThan',
        params: { limitField: 'date_of_sailing' },
        message: 'Date of Containerization cannot be later than Date of Sailing',
      },
    ])
  })
})
