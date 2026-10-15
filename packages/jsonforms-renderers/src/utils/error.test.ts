import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './error'

describe('getErrorMessage', () => {
  it('rewrites the required property message', () => {
    expect(getErrorMessage('is a required property', 'Levy')).toBe('Levy is required')
  })

  it('rewrites exclusiveMinimum / minimum / multipleOf messages', () => {
    expect(getErrorMessage('must be > 0', 'Levy')).toBe('Levy must be greater than 0')
    expect(getErrorMessage('must be >= 1', 'Qty')).toBe('Qty must be at least 1')
    expect(getErrorMessage('must be multiple of 0.01', 'Levy')).toBe('Levy must be a multiple of 0.01')
  })

  it('passes through unknown messages', () => {
    expect(getErrorMessage('must be string', 'Name')).toBe('must be string')
  })
})
