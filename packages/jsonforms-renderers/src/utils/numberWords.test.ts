import { describe, expect, it } from 'vitest'
import { spellNumber } from './numberWords'

describe('spellNumber', () => {
  it('spells the ones and the teens', () => {
    expect(spellNumber(1)).toBe('One')
    expect(spellNumber(19)).toBe('Nineteen')
  })

  it('spells the tens and the hyphenated ones', () => {
    expect(spellNumber(20)).toBe('Twenty')
    expect(spellNumber(21)).toBe('Twenty-One')
    expect(spellNumber(99)).toBe('Ninety-Nine')
  })

  it('leaves 100 and above as digits', () => {
    expect(spellNumber(100)).toBe('100')
    expect(spellNumber(101)).toBe('101')
  })
})
