import { createAjv, type JsonSchema } from '@jsonforms/core'
import { describe, expect, it } from 'vitest'

import { schemaErrorMessage } from './schemaErrorMessage'

/** The message each failed rule gets, keyed by the rule's schema path. */
function messages(schema: JsonSchema, data: unknown): Record<string, string | undefined> {
  const validate = createAjv().compile(schema)
  validate(data)
  return Object.fromEntries((validate.errors ?? []).map((e) => [e.schemaPath, schemaErrorMessage(e, schema)]))
}

const courier = {
  if: { properties: { delivery_method: { const: 'courier' } }, required: ['delivery_method'] },
}

const proofOfAddress = {
  properties: { type: { const: 'Proof of address' } },
  required: ['type'],
}

describe('schemaErrorMessage', () => {
  it("uses a field's message for its own rules", () => {
    const schema = {
      type: 'object',
      properties: {
        phone: { type: 'string', pattern: '^[0-9]{10}$', minLength: 10, 'x-error-message': 'Enter 10 digits.' },
      },
    }

    expect(messages(schema, { phone: 'ab' })).toEqual({
      '#/properties/phone/pattern': 'Enter 10 digits.',
      '#/properties/phone/minLength': 'Enter 10 digits.',
    })
  })

  it("uses a then's message for every rule inside it, including its required list", () => {
    const schema = {
      ...courier,
      then: {
        'x-error-message': 'Add a proof of address.',
        required: ['documents'],
        properties: { documents: { contains: proofOfAddress } },
      },
    }

    expect(messages(schema, { delivery_method: 'courier' })['#/then/required']).toBe('Add a proof of address.')
    expect(
      messages(schema, { delivery_method: 'courier', documents: [{ type: 'Invoice' }] })[
        '#/then/properties/documents/contains'
      ],
    ).toBe('Add a proof of address.')
  })

  it("uses an else's message for the rules inside it", () => {
    const schema = {
      ...courier,
      else: { 'x-error-message': 'Add a pickup point.', required: ['pickup_point'] },
    }

    expect(messages(schema, { delivery_method: 'pickup' })['#/else/required']).toBe('Add a pickup point.')
  })

  it("uses an allOf entry's message for the rules inside it", () => {
    const schema = {
      allOf: [{ 'x-error-message': 'Use a 3-letter code.', properties: { code: { minLength: 3 } } }],
    }

    expect(messages(schema, { code: 'a' })['#/allOf/0/properties/code/minLength']).toBe('Use a 3-letter code.')
  })

  it('prefers the nearest message', () => {
    const schema = {
      ...courier,
      then: {
        'x-error-message': 'Outer message.',
        properties: { reference: { pattern: '^R', 'x-error-message': 'Start with R.' } },
        if: { required: ['urgent'] },
        then: { 'x-error-message': 'Inner message.', properties: { reason: { minLength: 5 } } },
      },
    }

    const result = messages(schema, { delivery_method: 'courier', reference: 'x', urgent: true, reason: 'a' })
    expect(result['#/then/properties/reference/pattern']).toBe('Start with R.')
    expect(result['#/then/then/properties/reason/minLength']).toBe('Inner message.')
  })

  it("does not use an object's message for its fields' rules", () => {
    const schema = {
      type: 'object',
      properties: {
        consignee: {
          type: 'object',
          minProperties: 2,
          'x-error-message': 'Give the consignee details.',
          properties: { name: { type: 'string', minLength: 2 } },
        },
      },
    }

    expect(messages(schema, { consignee: { name: 'x' } })).toEqual({
      '#/properties/consignee/minProperties': 'Give the consignee details.',
      '#/properties/consignee/properties/name/minLength': undefined,
    })
  })

  it("does not use a then's message for the items a contains didn't match", () => {
    const schema = {
      ...courier,
      then: { 'x-error-message': 'Add a proof of address.', properties: { documents: { contains: proofOfAddress } } },
    }

    const result = messages(schema, { delivery_method: 'courier', documents: [{ type: 'Invoice' }] })
    expect(result['#/then/properties/documents/contains/properties/type/const']).toBeUndefined()
    expect(result['#/then/properties/documents/contains']).toBe('Add a proof of address.')
  })

  it('reads the message inside a local $ref target', () => {
    const schema = {
      $defs: { code: { type: 'string', minLength: 3, 'x-error-message': 'Use a 3-letter code.' } },
      properties: { code: { $ref: '#/$defs/code' } },
    }

    expect(messages(schema, { code: 'a' })['#/$defs/code/minLength']).toBe('Use a 3-letter code.')
  })

  it('follows property names with escaped / and ~', () => {
    const schema = {
      properties: { 'a/b~c': { type: 'string', minLength: 2, 'x-error-message': 'Too short.' } },
    }

    expect(messages(schema, { 'a/b~c': 'x' })['#/properties/a~1b~0c/minLength']).toBe('Too short.')
  })

  it('returns undefined when the form has no message', () => {
    const schema = { properties: { name: { type: 'string', minLength: 2 } } }

    expect(messages(schema, { name: 'x' })['#/properties/name/minLength']).toBeUndefined()
  })

  it("returns undefined for a path the schema can't follow", () => {
    expect(schemaErrorMessage({ schemaPath: '#/properties/missing/minLength' }, { properties: {} })).toBeUndefined()
    expect(schemaErrorMessage({ schemaPath: 'other.json#/minLength' }, {})).toBeUndefined()
  })
})
