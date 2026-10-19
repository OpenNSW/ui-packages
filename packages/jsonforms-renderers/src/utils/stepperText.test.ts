import { describe, expect, it } from 'vitest'
import { stepperText } from './stepperText'

describe('stepperText', () => {
  it('falls back to English and fills in placeholders', () => {
    expect(stepperText(undefined, 'stepOf', { step: 2, total: 7 })).toBe('Step 2 of 7')
  })

  it('uses the translation under stepper.<key>, keeping its placeholders', () => {
    const translate = (id: string, fallback?: string) =>
      id === 'stepper.noteToFix' ? 'à corriger : {count}' : fallback
    expect(stepperText(translate as never, 'noteToFix', { count: 3 })).toBe('à corriger : 3')
    expect(stepperText(translate as never, 'back')).toBe('Back')
  })
})
