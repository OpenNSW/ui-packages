import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './error'

describe('getErrorMessage', () => {
  it('rewrites the required property message', () => {
    expect(getErrorMessage('is a required property', 'Amount')).toBe('Amount is required')
  })

  it('rewrites exclusiveMinimum / minimum / multipleOf messages', () => {
    expect(getErrorMessage('must be > 0', 'Amount')).toBe('Amount must be greater than 0')
    expect(getErrorMessage('must be >= 1', 'Qty')).toBe('Qty must be at least 1')
    expect(getErrorMessage('must be multiple of 0.01', 'Amount')).toBe('Amount must be a multiple of 0.01')
  })

  it('rewrites a formatMinimum bound', () => {
    expect(getErrorMessage('should be >= today', 'Estimated Shipment Date')).toBe(
      'Estimated Shipment Date must be today or later',
    )
    expect(getErrorMessage('should be >= 2026-01-01', 'Estimated Shipment Date')).toBe(
      'Estimated Shipment Date must be on or after 1 Jan 2026',
    )
  })

  it('passes through unknown messages', () => {
    expect(getErrorMessage('must be string', 'Name')).toBe('must be string')
  })
})
