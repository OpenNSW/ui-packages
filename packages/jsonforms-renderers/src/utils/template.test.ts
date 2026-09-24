import { describe, expect, it } from 'vitest'
import { renderTemplate } from './template'

describe('renderTemplate', () => {
  it('fills each placeholder from an interface-typed value', () => {
    interface Option {
      id: string
      name: string
    }
    const option: Option = { id: 'USUJS', name: 'HAMPTON' }
    expect(renderTemplate('{id}-{name}', option)).toBe('USUJS-HAMPTON')
  })

  it('fills a repeated placeholder everywhere it appears', () => {
    expect(renderTemplate('{seq}/{seq}', { seq: '07' })).toBe('07/07')
  })

  it('renders null and undefined as empty', () => {
    expect(renderTemplate('[{a}][{b}]', { a: null, b: undefined })).toBe('[][]')
  })

  it('renders 0 and false rather than treating them as empty', () => {
    expect(renderTemplate('{n} {flag}', { n: 0, flag: false })).toBe('0 false')
  })

  it('leaves a name that values does not have as written', () => {
    expect(renderTemplate('{value} of {total}', { value: '12.00' })).toBe('12.00 of {total}')
  })

  it('leaves a value it cannot print as written', () => {
    expect(renderTemplate('{a}|{b}|{c}', { a: { value: 'x' }, b: ['x'], c: new Date(0) })).toBe('{a}|{b}|{c}')
  })

  it('does not read inherited properties', () => {
    expect(renderTemplate('{constructor} {toString}', {})).toBe('{constructor} {toString}')
  })

  it('leaves braces that are not placeholders as written', () => {
    expect(renderTemplate('{} {a.b} {a-b}', { a: 'x' })).toBe('{} {a.b} {a-b}')
    expect(renderTemplate('{{value}}', { value: 'x' })).toBe('{x}')
  })

  it('inserts replacement patterns in a value literally', () => {
    expect(renderTemplate('{a}', { a: '$& $1 $$' })).toBe('$& $1 $$')
  })

  it('returns a template without placeholders unchanged', () => {
    expect(renderTemplate('export.xml', { value: 'x' })).toBe('export.xml')
    expect(renderTemplate('', { value: 'x' })).toBe('')
  })

  // Parity with the split/join ComputedControl used for x-computed's format.
  it.each(['{value}', '{value} kg', '{value}{value}', '{value} of {total}', '{{value}}', 'no token', ''])(
    'matches the old x-computed format for %j',
    (format) => {
      expect(renderTemplate(format, { value: '1,234.50' })).toBe(format.split('{value}').join('1,234.50'))
    },
  )
})
