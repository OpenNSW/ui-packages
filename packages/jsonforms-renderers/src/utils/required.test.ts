import { describe, expect, it } from 'vitest'
import { createAjv } from '@jsonforms/core'
import { cloneDataWithoutPath, isPathRequiredBySchema, parentInstancePath, propertyNameFromPath } from './required'

describe('propertyNameFromPath / parentInstancePath', () => {
  it('splits a dotted path', () => {
    expect(propertyNameFromPath('assessedLevy')).toBe('assessedLevy')
    expect(propertyNameFromPath('address.city')).toBe('city')
    expect(parentInstancePath('assessedLevy')).toBe('')
    expect(parentInstancePath('address.city')).toBe('/address')
    expect(parentInstancePath('items.0.name')).toBe('/items/0')
  })
})

describe('cloneDataWithoutPath', () => {
  it('removes a root property without mutating the original', () => {
    const data = { a: 1, b: 2 }
    expect(cloneDataWithoutPath(data, 'a')).toEqual({ b: 2 })
    expect(data).toEqual({ a: 1, b: 2 })
  })

  it('removes a nested property', () => {
    expect(cloneDataWithoutPath({ address: { city: 'X', zip: '1' } }, 'address.city')).toEqual({
      address: { zip: '1' },
    })
  })
})

describe('isPathRequiredBySchema', () => {
  const schema = {
    type: 'object',
    properties: {
      reviewOutcome: { type: 'string' },
      sltbReference: { type: 'string' },
      assessedLevy: { type: 'number', exclusiveMinimum: 0 },
      address: {
        type: 'object',
        properties: { city: { type: 'string' } },
      },
    },
    allOf: [
      {
        if: {
          properties: { reviewOutcome: { const: 'approve' } },
          required: ['reviewOutcome'],
        },
        then: { required: ['sltbReference', 'assessedLevy'] },
      },
      {
        if: {
          properties: { reviewOutcome: { const: 'approve' } },
          required: ['reviewOutcome'],
        },
        then: {
          properties: {
            address: { type: 'object', required: ['city'] },
          },
        },
      },
    ],
  }

  const validate = createAjv().compile(schema)

  it('is false when the if-condition does not apply', () => {
    expect(isPathRequiredBySchema('assessedLevy', { reviewOutcome: 'reject' }, validate)).toBe(false)
    expect(isPathRequiredBySchema('sltbReference', { reviewOutcome: 'reject' }, validate)).toBe(false)
  })

  it('is true for then.required fields when the condition matches', () => {
    const data = { reviewOutcome: 'approve', sltbReference: 'REF', assessedLevy: 10 }
    expect(isPathRequiredBySchema('assessedLevy', data, validate)).toBe(true)
    expect(isPathRequiredBySchema('sltbReference', data, validate)).toBe(true)
  })

  it('still reports required when the field is already filled', () => {
    // Asterisk must remain while the condition holds, not only when empty.
    expect(isPathRequiredBySchema('assessedLevy', { reviewOutcome: 'approve', assessedLevy: 99 }, validate)).toBe(true)
  })

  it('matches nested required under a parent instancePath', () => {
    const data = { reviewOutcome: 'approve', address: { city: 'Colombo' } }
    expect(isPathRequiredBySchema('address.city', data, validate)).toBe(true)
    expect(isPathRequiredBySchema('address.city', { reviewOutcome: 'reject', address: {} }, validate)).toBe(false)
  })

  it('returns false without a validator', () => {
    expect(isPathRequiredBySchema('assessedLevy', { reviewOutcome: 'approve' }, undefined)).toBe(false)
  })
})
