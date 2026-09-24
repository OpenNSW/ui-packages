import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseTemplate, renderTemplate } from './template'

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

describe('renderTemplate function calls', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 4, 23, 30))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats today with dayjs tokens, YYYY-MM-DD by default', () => {
    expect(renderTemplate('{today()}', {})).toBe('2026-05-04')
    expect(renderTemplate('{today(DD/MM/YYYY)}', {})).toBe('04/05/2026')
    expect(renderTemplate('{today(YYYYMMDD)}', {})).toBe('20260504')
    expect(renderTemplate('{today(MMM D, YYYY)}', {})).toBe('May 4, 2026')
  })

  it('passes the argument to a caller function', () => {
    const seq = (width: string) => '7'.padStart(Number(width), '0')
    expect(renderTemplate('{orderNo}-{seq(3)}', { orderNo: 'ORD-77' }, { seq })).toBe('ORD-77-007')
  })

  it('lets a caller function replace a built-in', () => {
    expect(renderTemplate('{today()}', {}, { today: () => 'fixed' })).toBe('fixed')
  })

  it('treats {today} without parentheses as a value', () => {
    expect(renderTemplate('{today}', {})).toBe('{today}')
    expect(renderTemplate('{today}', { today: 'from values' })).toBe('from values')
  })

  it('applies the value rules to a function result', () => {
    expect(renderTemplate('[{a()}][{b()}]', {}, { a: () => null, b: () => ({}) })).toBe('[][{b()}]')
  })

  it('leaves unknown, inherited and throwing functions as written', () => {
    const fail = () => {
      throw new Error('boom')
    }
    expect(renderTemplate('{nope(1)} {constructor()} {fail()}', {}, { fail })).toBe(
      '{nope(1)} {constructor()} {fail()}',
    )
  })

  it('leaves malformed calls as written', () => {
    expect(renderTemplate('{f(} {f(a(b))} {f()x}', {}, { f: () => 'x' })).toBe('{f(} {f(a(b))} {f()x}')
  })
})

describe('parseTemplate', () => {
  it('splits literal text, values and calls', () => {
    expect(parseTemplate('{orderNo}-{today(YYYYMMDD)}-{seq(3)}')).toEqual([
      { name: 'orderNo' },
      '-',
      { name: 'today', arg: 'YYYYMMDD' },
      '-',
      { name: 'seq', arg: '3' },
    ])
  })

  it('keeps an empty argument distinct from a value', () => {
    expect(parseTemplate('{a}{b()}')).toEqual([{ name: 'a' }, { name: 'b', arg: '' }])
  })
})
