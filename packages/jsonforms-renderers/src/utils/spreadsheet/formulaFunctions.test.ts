import { beforeAll, describe, expect, it } from 'vitest'
import * as formulajs from '@formulajs/formulajs'
import type { FormulaError as LibFormulaErrorClass } from 'fast-formula-parser'
import { ALLOWED_FUNCTIONS, assertAllowedFunctions, backfilledFunctions } from './formulaFunctions'
import { FormulaError } from './reference'

function expectFormulaError(fn: () => unknown, code: string) {
  try {
    fn()
  } catch (err) {
    if (!(err instanceof FormulaError)) throw err
    expect(err.code).toBe(code)
    return
  }
  throw new Error('expected function to throw a FormulaError')
}

describe('assertAllowedFunctions (the allowlist pre-scan)', () => {
  it('allows a formula that only calls allowlisted functions', () => {
    expect(() => assertAllowedFunctions('SUM(B2:B5)+ROUND(AVERAGE(H2:H6),2)')).not.toThrow()
  })

  it('is case-insensitive', () => {
    expect(() => assertAllowedFunctions('sum(B2:B5)')).not.toThrow()
    expect(() => assertAllowedFunctions('Sum(B2:B5)')).not.toThrow()
  })

  it('rejects a function name that is not on the allowlist with a NAME error', () => {
    expectFormulaError(() => assertAllowedFunctions('FOOBAR(B2)'), 'NAME')
  })

  it('rejects a genuinely-stubbed, NOT-backfilled function (SUBTOTAL) rather than letting it reach the parser', () => {
    // SUBTOTAL has real (but incomplete/TODO) code in fast-formula-parser and
    // was deliberately not backfilled — confirming it is rejected here proves
    // the allowlist, not the library's own behavior, is what's protecting us.
    expectFormulaError(() => assertAllowedFunctions('SUBTOTAL(9,B2:B5)'), 'NAME')
  })

  it('rejects a disallowed function nested inside an allowed one', () => {
    expectFormulaError(() => assertAllowedFunctions('SUM(FOOBAR(B2),1)'), 'NAME')
  })

  it('does not false-positive on a bare cell or range reference', () => {
    expect(() => assertAllowedFunctions('B2+B3')).not.toThrow()
    expect(() => assertAllowedFunctions('B2:B5')).not.toThrow()
  })

  it('does not scan inside a string literal', () => {
    // The text "FOOBAR(" only appears as data here, never as a call.
    expect(() => assertAllowedFunctions('CONCATENATE("FOOBAR(", "x")')).not.toThrow()
  })

  it('handles a doubled-quote escape inside a string literal without misreading the boundary', () => {
    expect(() => assertAllowedFunctions('CONCATENATE("say ""FOOBAR("" here")')).not.toThrow()
  })

  it('tolerates whitespace between a function name and its opening paren', () => {
    expect(() => assertAllowedFunctions('SUM (B2:B5)')).not.toThrow()
  })

  it('every function on the allowlist is accepted as a bare call', () => {
    for (const name of ALLOWED_FUNCTIONS) {
      expect(() => assertAllowedFunctions(`${name}(1)`), name).not.toThrow()
    }
  })
})

// backfilledFunctions() is exercised directly here (bypassing the parser) so
// argument-shape edge cases — the wrapped `{ value, isArray }` form every
// function receives, forced exact-match for MATCH, error propagation — are
// pinned precisely. End-to-end formula-string behavior is covered in
// expression.test.ts.
describe('backfilledFunctions', () => {
  let fns: Record<string, (...args: unknown[]) => unknown>
  let LibFormulaError: typeof LibFormulaErrorClass

  beforeAll(async () => {
    const ffpModule = (await import('fast-formula-parser')) as unknown as {
      default?: new (options: unknown) => unknown
    } & Record<string, unknown>
    const FormulaParser = (ffpModule.default ?? ffpModule) as unknown as { FormulaError: typeof LibFormulaErrorClass }
    LibFormulaError = FormulaParser.FormulaError
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fns = backfilledFunctions(formulajs as any, LibFormulaError)
  })

  const wrap = (value: unknown) => ({ value, isArray: Array.isArray(value) })

  // Unlike every other function in this describe block, IF is one of
  // fast-formula-parser's own `funsNeedContextAndNoDataRetrieve` names — it
  // receives the raw `FormulaParser` instance as `context` and its other
  // arguments completely unwrapped (no `wrap()` helper), so it needs its own
  // fake `context.retrieveRef` rather than the shared `wrap()` shape. A
  // plain `{ resolved }` object stands in for the lazy `{ref: {...}}`
  // descriptor a real bare cell/range reference would arrive as.
  describe('IF (condition coercion — see LOGICAL_FUNCTIONS_WITH_BROKEN_CONDITION_COERCION)', () => {
    const fakeContext = { retrieveRef: (ref: unknown) => (ref as { resolved: unknown }).resolved }

    it('accepts a boolean or number condition; a nonzero number is true, zero is false', () => {
      expect(fns.IF(fakeContext, true, 'yes', 'no')).toBe('yes')
      expect(fns.IF(fakeContext, false, 'yes', 'no')).toBe('no')
      expect(fns.IF(fakeContext, 0, 'yes', 'no')).toBe('no')
      expect(fns.IF(fakeContext, 5, 'yes', 'no')).toBe('yes')
    })

    it('rejects a string condition with #VALUE! regardless of its content — the defect this backfill fixes', () => {
      expect(() => fns.IF(fakeContext, 'abc', 'yes', 'no')).toThrow(expect.objectContaining({ error: '#VALUE!' }))
      expect(() => fns.IF(fakeContext, '', 'yes', 'no')).toThrow(expect.objectContaining({ error: '#VALUE!' }))
      expect(() => fns.IF(fakeContext, 'FALSE', 'yes', 'no')).toThrow(expect.objectContaining({ error: '#VALUE!' }))
    })

    it('dereferences a bare reference used as the condition via context.retrieveRef — the other defect this backfill fixes', () => {
      expect(fns.IF(fakeContext, { resolved: 5 }, 'yes', 'no')).toBe('yes')
      expect(fns.IF(fakeContext, { resolved: 0 }, 'yes', 'no')).toBe('no')
      expect(fns.IF(fakeContext, { resolved: false }, 'yes', 'no')).toBe('no')
    })

    it('propagates a FormulaError condition (e.g. from a 1/0 branch) instead of coercing it', () => {
      const err = new LibFormulaError('#DIV/0!')
      expect(() => fns.IF(fakeContext, err, 'yes', 'no')).toThrow(expect.objectContaining({ error: '#DIV/0!' }))
    })

    it('a missing condition throws NA; a missing false-branch defaults to false', () => {
      expect(() => fns.IF(fakeContext, undefined, 'yes', 'no')).toThrow(expect.objectContaining({ error: '#N/A' }))
      expect(() => fns.IF(fakeContext, true, undefined, 'no')).toThrow(expect.objectContaining({ error: '#N/A' }))
      expect(fns.IF(fakeContext, false, 'yes', undefined)).toBe(false)
    })

    it('never dereferences the untaken branch — a bare-reference-shaped value in it is simply discarded', () => {
      expect(fns.IF(fakeContext, true, 'yes', { ref: { row: 999, col: 999 } })).toBe('yes')
    })
  })

  it('MAX/MIN unwrap the wrapped arg shape and pool ranges with bare scalars', () => {
    expect(fns.MAX(wrap(5), wrap([1, 9, 3]))).toBe(9)
    expect(fns.MIN(wrap(5), wrap([1, 9, 3]))).toBe(1)
  })

  it('MAX/MIN over empty input is 0, matching the hand-rolled engine this replaces', () => {
    expect(fns.MAX()).toBe(0)
    expect(fns.MIN()).toBe(0)
  })

  it('MATCH forces exact match even when a match_type is supplied', () => {
    // An unsorted array where an approximate match (type 1) would find a
    // *different* (wrong) index than the true exact match.
    const array = wrap([30, 10, 20])
    expect(fns.MATCH(wrap(20), array)).toBe(3)
  })

  it('MATCH throws the library NA error when there is no exact match', () => {
    const array = wrap([10, 20, 30])
    expect(() => fns.MATCH(wrap(999), array)).toThrow(expect.objectContaining({ error: '#N/A' }))
  })

  it('SWITCH picks the matching branch', () => {
    expect(fns.SWITCH(wrap(2), wrap(1), wrap('one'), wrap(2), wrap('two'))).toBe('two')
  })

  it('SUBSTITUTE replaces every occurrence by default', () => {
    expect(fns.SUBSTITUTE(wrap('hello world'), wrap('o'), wrap('0'))).toBe('hell0 w0rld')
  })

  it('TEXTJOIN ignores blanks when asked to', () => {
    expect(fns.TEXTJOIN(wrap(', '), wrap(true), wrap(['a', '', 'b']))).toBe('a, b')
  })

  it('COUNTA counts non-blank values across pooled ranges', () => {
    expect(fns.COUNTA(wrap(['a', null, 1]), wrap(''))).toBe(2)
  })

  it('UPPER uppercases text', () => {
    expect(fns.UPPER(wrap('abc'))).toBe('ABC')
  })

  it('YEAR/MONTH/DAY correctly read a real JS Date value (the native fast-formula-parser bug this backfill avoids)', () => {
    const date = wrap(new Date(2024, 0, 15))
    expect(fns.YEAR(date)).toBe(2024)
    expect(fns.MONTH(date)).toBe(1)
    expect(fns.DAY(date)).toBe(15)
  })

  it('WEEKDAY reads a real JS Date value', () => {
    // Jan 15 2024 is a Monday -> weekday 2 under the default (Sunday=1) scheme.
    expect(fns.WEEKDAY(wrap(new Date(2024, 0, 15)))).toBe(2)
  })

  it('propagates a library error already present among pooled arguments instead of feeding it to formulajs', () => {
    const err = new LibFormulaError('#REF!')
    expect(() => fns.MAX(wrap(1), wrap(err))).toThrow(expect.objectContaining({ error: '#REF!' }))
  })

  it('LARGE/SMALL/PERMUT/PERMUTATIONA/MEDIAN/MAXA/MINA all compute a real answer', () => {
    expect(fns.LARGE(wrap([1, 5, 3, 9, 2]), wrap(2))).toBe(5)
    expect(fns.SMALL(wrap([1, 5, 3, 9, 2]), wrap(2))).toBe(2)
    expect(fns.PERMUT(wrap(5), wrap(2))).toBe(20)
    expect(fns.PERMUTATIONA(wrap(5), wrap(2))).toBe(25)
    expect(fns.MEDIAN(wrap([1, 2, 3, 4]))).toBe(2.5)
    expect(fns.MAXA(wrap([1, 'x', 3]))).toBe(3)
    expect(fns.MINA(wrap([1, 'x', -3]))).toBe(-3)
  })

  // These text functions are backfilled (rather than left native, even though
  // fast-formula-parser's own bodies for them are real, non-stub code) for a
  // second, independently-discovered defect: the native implementations route
  // a scalar argument through the library's own `FormulaHelpers.accept`,
  // which fails to unwrap a *blank* cell's wrapped argument (its `.value` is
  // `null`, and the unwrap check is `!= null`) and leaks its own internal
  // wrapper object into the function body instead — see the module comment
  // above `TEXT_FUNCTIONS_BROKEN_FOR_BLANK_CELLS` in formulaFunctions.ts for
  // the full story. `wrap(null)` here simulates exactly that: a cell that
  // resolved to blank, the same shape `expression.ts`'s own `onCell` produces
  // for a genuinely empty cell.
  describe('text function backfills correctly treat a blank cell as empty text', () => {
    it('CONCATENATE treats a blank argument as empty text, not the literal "[object Object]"', () => {
      expect(fns.CONCATENATE(wrap('x'), wrap(null), wrap('y'))).toBe('xy')
    })

    it('CONCATENATE joins a whole range argument with no separator (not a comma-joined array stringification)', () => {
      expect(fns.CONCATENATE(wrap([10, 20, 5]))).toBe('10205')
    })

    it('CONCAT behaves identically to CONCATENATE', () => {
      expect(fns.CONCAT(wrap('a'), wrap(1), wrap(false))).toBe('a1FALSE')
    })

    it('LEN of a blank cell is 0, not the length of a leaked internal object', () => {
      expect(fns.LEN(wrap(null))).toBe(0)
    })

    it('TRIM/LOWER of a blank cell is empty text', () => {
      expect(fns.TRIM(wrap(null))).toBe('')
      expect(fns.LOWER(wrap(null))).toBe('')
    })

    it('LEFT/RIGHT/MID of a blank cell are empty text', () => {
      expect(fns.LEFT(wrap(null), wrap(2))).toBe('')
      expect(fns.RIGHT(wrap(null), wrap(2))).toBe('')
      expect(fns.MID(wrap(null), wrap(1), wrap(2))).toBe('')
    })

    it('LEFT/RIGHT apply Excel’s default of 1 character when num_chars is omitted', () => {
      expect(fns.LEFT(wrap('hello'))).toBe('h')
      expect(fns.RIGHT(wrap('hello'))).toBe('o')
    })

    it('FIND/SEARCH throw a NA-shaped-free VALUE error for a blank haystack rather than matching inside a leaked object', () => {
      expect(() => fns.FIND(wrap('l'), wrap(null))).toThrow(expect.objectContaining({ error: '#VALUE!' }))
      expect(() => fns.SEARCH(wrap('l'), wrap(null))).toThrow(expect.objectContaining({ error: '#VALUE!' }))
    })

    it('SEARCH is case-insensitive (unlike the native implementation, which is not)', () => {
      expect(fns.SEARCH(wrap('L'), wrap('hello'))).toBe(3)
    })
  })
})
