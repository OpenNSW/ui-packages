import type { JsonSchema } from '@jsonforms/core'
import { describe, expect, it } from 'vitest'
import { collectNotLaterThanErrors, notLaterThanControlError } from './notLaterThan'

const rootSchema = {
  type: 'object',
  properties: {
    date_of_containerization: {
      type: 'string',
      format: 'date',
      title: 'Date of Containerization',
      'x-notLaterThan': 'date_of_sailing',
    },
    date_of_sailing: { type: 'string', format: 'date', title: 'Date of Sailing' },
    nested: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          format: 'date',
          title: 'Start',
          'x-notLaterThan': 'end',
        },
        end: { type: 'string', format: 'date', title: 'End' },
      },
    },
    legs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          depart: {
            type: 'string',
            format: 'date',
            title: 'Depart',
            'x-notLaterThan': 'arrive',
          },
          arrive: { type: 'string', format: 'date', title: 'Arrive' },
        },
      },
    },
    stamped_at: {
      type: 'string',
      format: 'date-time',
      title: 'Stamped at',
      'x-notLaterThan': 'deadline',
    },
    deadline: { type: 'string', format: 'date', title: 'Deadline' },
    only_time: {
      type: 'string',
      format: 'time',
      title: 'Only time',
      'x-notLaterThan': 'date_of_sailing',
    },
  },
} as unknown as JsonSchema

const containerSchema = rootSchema.properties!.date_of_containerization as JsonSchema

describe('notLaterThanControlError', () => {
  it('errors when this date is after the sibling, using the sibling title', () => {
    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-20', date_of_sailing: '2026-06-12' },
        'date_of_containerization',
        '2026-06-20',
        containerSchema,
        'Date of Containerization',
        rootSchema,
      ),
    ).toBe('Date of Containerization cannot be later than Date of Sailing')
  })

  it('is silent when equal, earlier, or sibling missing', () => {
    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-12', date_of_sailing: '2026-06-12' },
        'date_of_containerization',
        '2026-06-12',
        containerSchema,
        'Date of Containerization',
        rootSchema,
      ),
    ).toBeUndefined()
    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-20' },
        'date_of_containerization',
        '2026-06-20',
        containerSchema,
        'Date of Containerization',
        rootSchema,
      ),
    ).toBeUndefined()
  })

  it('checks nested paths and ignores time format / non-string limits', () => {
    expect(
      notLaterThanControlError(
        { nested: { start: '2026-07-02', end: '2026-07-01' } },
        'nested.start',
        '2026-07-02',
        (rootSchema.properties!.nested as JsonSchema).properties!.start as JsonSchema,
        'Start',
        rootSchema,
      ),
    ).toBe('Start cannot be later than End')

    expect(
      notLaterThanControlError(
        { only_time: '12:30', date_of_sailing: '2026-06-12' },
        'only_time',
        '12:30',
        rootSchema.properties!.only_time as JsonSchema,
        'Only time',
        rootSchema,
      ),
    ).toBeUndefined()

    expect(
      notLaterThanControlError(
        { date_of_containerization: '2026-06-20', date_of_sailing: '2026-06-12' },
        'date_of_containerization',
        '2026-06-20',
        { type: 'string', format: 'date', 'x-notLaterThan': 1 } as unknown as JsonSchema,
        'Date of Containerization',
        rootSchema,
      ),
    ).toBeUndefined()
  })

  it('compares mixed date / date-time at day granularity', () => {
    expect(
      notLaterThanControlError(
        { stamped_at: '2026-06-12T10:00:00+05:30', deadline: '2026-06-12' },
        'stamped_at',
        '2026-06-12T10:00:00+05:30',
        rootSchema.properties!.stamped_at as JsonSchema,
        'Stamped at',
        rootSchema,
      ),
    ).toBeUndefined()

    expect(
      notLaterThanControlError(
        { stamped_at: '2026-06-14T12:00:00Z', deadline: '2026-06-12' },
        'stamped_at',
        '2026-06-14T12:00:00Z',
        rootSchema.properties!.stamped_at as JsonSchema,
        'Stamped at',
        rootSchema,
      ),
    ).toBe('Stamped at cannot be later than Deadline')
  })

  it('is silent for invalid date strings', () => {
    expect(
      notLaterThanControlError(
        { date_of_containerization: 'not-a-date', date_of_sailing: '2026-06-12' },
        'date_of_containerization',
        'not-a-date',
        containerSchema,
        'Date of Containerization',
        rootSchema,
      ),
    ).toBeUndefined()
  })
})

describe('collectNotLaterThanErrors', () => {
  it('builds one AJV-shaped error with schema titles', () => {
    expect(
      collectNotLaterThanErrors(rootSchema, {
        date_of_containerization: '2026-06-20',
        date_of_sailing: '2026-06-12',
      }),
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

  it('recurses into nested objects and arrays; supports dotted limit paths', () => {
    expect(
      collectNotLaterThanErrors(rootSchema, {
        nested: { start: '2026-07-02', end: '2026-07-01' },
        legs: [{ depart: '2026-08-05', arrive: '2026-08-01' }],
      }),
    ).toEqual([
      {
        instancePath: '/nested/start',
        schemaPath: '#/properties/start/x-notLaterThan',
        keyword: 'x-notLaterThan',
        params: { limitField: 'end' },
        message: 'Start cannot be later than End',
      },
      {
        instancePath: '/legs/0/depart',
        schemaPath: '#/properties/depart/x-notLaterThan',
        keyword: 'x-notLaterThan',
        params: { limitField: 'arrive' },
        message: 'Depart cannot be later than Arrive',
      },
    ])

    const withDotted = {
      type: 'object',
      properties: {
        shipment: {
          type: 'object',
          properties: {
            sailing: { type: 'string', format: 'date', title: 'Sailing' },
          },
        },
        containerization: {
          type: 'string',
          format: 'date',
          title: 'Containerization',
          'x-notLaterThan': 'shipment.sailing',
        },
      },
    } as unknown as JsonSchema

    expect(
      collectNotLaterThanErrors(withDotted, {
        shipment: { sailing: '2026-06-12' },
        containerization: '2026-06-20',
      }),
    ).toEqual([
      {
        instancePath: '/containerization',
        schemaPath: '#/properties/containerization/x-notLaterThan',
        keyword: 'x-notLaterThan',
        params: { limitField: 'shipment.sailing' },
        message: 'Containerization cannot be later than Sailing',
      },
    ])
  })
})
