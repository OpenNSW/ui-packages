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

  it('rewrites format-limit bounds for all four comparisons', () => {
    expect(getErrorMessage('should be >= today', 'Estimated Shipment Date')).toBe(
      'Estimated Shipment Date must be today or later',
    )
    expect(getErrorMessage('should be >= 2026-01-01', 'Estimated Shipment Date')).toBe(
      'Estimated Shipment Date must be on or after 1 Jan 2026',
    )
    expect(getErrorMessage('should be <= today', 'Expiry Date')).toBe('Expiry Date must be today or earlier')
    expect(getErrorMessage('should be <= 2026-12-31', 'Expiry Date')).toBe(
      'Expiry Date must be on or before 31 Dec 2026',
    )
    expect(getErrorMessage('should be > today', 'Start Date')).toBe('Start Date must be after today')
    expect(getErrorMessage('should be > 2026-01-01', 'Start Date')).toBe('Start Date must be after 1 Jan 2026')
    expect(getErrorMessage('should be < today', 'End Date')).toBe('End Date must be before today')
    expect(getErrorMessage('should be < 2026-12-31', 'End Date')).toBe('End Date must be before 31 Dec 2026')
  })

  it('passes through unknown messages', () => {
    expect(getErrorMessage('must be string', 'Name')).toBe('must be string')
  })
})
