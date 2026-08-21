import { describe, expect, it } from 'vitest'
import { columnLetterToIndex, FormulaError, indexToColumnLetter } from './reference'

describe('columnLetterToIndex / indexToColumnLetter', () => {
  const cases: Array<{ letters: string; index: number }> = [
    { letters: 'A', index: 0 },
    { letters: 'Z', index: 25 },
    { letters: 'AA', index: 26 },
    { letters: 'AZ', index: 51 },
    { letters: 'BA', index: 52 },
  ]

  for (const { letters, index } of cases) {
    it(`columnLetterToIndex('${letters}') === ${index}`, () => {
      expect(columnLetterToIndex(letters)).toBe(index)
    })

    it(`indexToColumnLetter(${index}) === '${letters}'`, () => {
      expect(indexToColumnLetter(index)).toBe(letters)
    })

    it(`round-trips both ways for '${letters}' / ${index}`, () => {
      expect(columnLetterToIndex(indexToColumnLetter(index))).toBe(index)
      expect(indexToColumnLetter(columnLetterToIndex(letters))).toBe(letters)
    })
  }

  it('accepts lowercase letters', () => {
    expect(columnLetterToIndex('a')).toBe(0)
    expect(columnLetterToIndex('az')).toBe(51)
  })
})

describe('FormulaError', () => {
  it('carries its code and defaults its message to the code', () => {
    const err = new FormulaError('REF')
    expect(err.code).toBe('REF')
    expect(err.message).toBe('REF')
    expect(err.name).toBe('FormulaError')
    expect(err).toBeInstanceOf(Error)
  })

  it('accepts an explicit message distinct from the code', () => {
    const err = new FormulaError('NAME', 'Function FOO is not allowed.')
    expect(err.code).toBe('NAME')
    expect(err.message).toBe('Function FOO is not allowed.')
  })
})
