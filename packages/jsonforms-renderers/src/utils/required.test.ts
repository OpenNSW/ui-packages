import { describe, expect, it } from 'vitest'
import { showRequiredAsterisk } from './required'

describe('showRequiredAsterisk', () => {
  it('is true when JSON Forms marks the field required', () => {
    expect(showRequiredAsterisk({ required: true, uischema: { type: 'Control' } })).toBe(true)
  })

  it('is true when uischema.options.required forces the indicator', () => {
    expect(
      showRequiredAsterisk({
        required: false,
        uischema: { type: 'Control', options: { required: true } },
      }),
    ).toBe(true)
  })

  it('is false when neither schema nor options mark required', () => {
    expect(showRequiredAsterisk({ required: false, uischema: { type: 'Control' } })).toBe(false)
  })
})
