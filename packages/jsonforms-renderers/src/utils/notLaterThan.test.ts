import { describe, expect, it } from 'vitest'
import { collectNotLaterThanErrors, notLaterThanControlError } from './notLaterThan'

describe('notLaterThanControlError', () => {
  const schema = { type: 'string', format: 'date', 'x-notLaterThan': 'date_of_sailing' }

  it('errors when this date is after the sibling', () => {
    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-20', date_of_sailing: '2026-06-12' },
        'date_of_containerization',
        '2026-06-20',
        schema,
        'Date of Containerization',
      ),
    ).toBe('Date of Containerization cannot be later than date_of_sailing')
  })

  it('is silent when equal, earlier, or sibling missing', () => {
    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-12', date_of_sailing: '2026-06-12' },
        'date_of_containerization',
        '2026-06-12',
        schema,
        'Date of Containerization',
      ),
    ).toBeUndefined()
    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-20' },
        'date_of_containerization',
        '2026-06-20',
        schema,
        'Date of Containerization',
      ),
    ).toBeUndefined()
  })
})

describe('collectNotLaterThanErrors', () => {
  it('builds one AJV-shaped error with schema titles', () => {
    expect(
      collectNotLaterThanErrors(
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
      ),
    ).toEqual([
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
