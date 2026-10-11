import { describe, expect, it } from 'vitest'
import { timeInputValue, toRfc3339Time } from './time'

describe('toRfc3339Time', () => {
  it('pads HH:MM with zero seconds', () => {
    expect(toRfc3339Time('14:30')).toBe('14:30:00')
  })

  it('leaves HH:MM:SS unchanged', () => {
    expect(toRfc3339Time('14:30:45')).toBe('14:30:45')
  })

  it('clears an empty picker value', () => {
    expect(toRfc3339Time('')).toBeUndefined()
  })
})

describe('timeInputValue', () => {
  it('drops seconds when the seconds spinner is off', () => {
    expect(timeInputValue('14:30:00', false)).toBe('14:30')
  })

  it('keeps seconds when the seconds spinner is on', () => {
    expect(timeInputValue('14:30:45', true)).toBe('14:30:45')
  })

  it('fills missing seconds for the seconds spinner', () => {
    expect(timeInputValue('14:30', true)).toBe('14:30:00')
  })
})
