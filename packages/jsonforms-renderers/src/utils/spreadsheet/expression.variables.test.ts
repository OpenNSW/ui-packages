import { describe, expect, it } from 'vitest'
import { evaluateFormulaWithVariables } from './expression'
import { FormulaError } from './reference'
import type { FormulaErrorCode } from './types'

async function expectFormulaError(promise: Promise<unknown>, code: FormulaErrorCode) {
  try {
    await promise
  } catch (err) {
    if (!(err instanceof FormulaError)) throw err
    expect(err.code).toBe(code)
    return
  }
  throw new Error('expected the promise to reject with a FormulaError')
}

describe('evaluateFormulaWithVariables', () => {
  it('resolves a bare variable to its value', async () => {
    expect(await evaluateFormulaWithVariables({ total_sales: 27000 }, 'total_sales')).toBe(27000)
  })

  it('evaluates arithmetic across multiple named variables', async () => {
    const variables = { total_sales: 27000, total_imported: 5000, total_blend_balance: 0 }
    expect(await evaluateFormulaWithVariables(variables, 'total_sales + total_imported + total_blend_balance')).toBe(
      32000,
    )
  })

  it('a function call works over variables the same as it would over cells', async () => {
    expect(await evaluateFormulaWithVariables({ numerator: 10, denominator: 3 }, '=ROUND(numerator/denominator,2)')).toBeCloseTo(
      3.33,
      2,
    )
  })

  it('tolerates a missing leading =', async () => {
    expect(await evaluateFormulaWithVariables({ total: 100, exported: 40 }, 'total - exported')).toBe(60)
  })

  it('documents the alias-naming pitfall: a short all-letter alias collides with a spreadsheet column reference', async () => {
    // "qty" is 3 letters, matching the library's Column token (`[A-Za-z]{1,3}`)
    // at equal length to the Name token match, so the lexer treats it as a
    // whole-column reference rather than routing it through onVariable at
    // all — it never reaches our onVariable hook, so #NAME? isn't produced;
    // the library's own top-level "single column reference" handling
    // resolves it to #VALUE! instead, with nothing backing a real column
    // here. Longer or digit/underscore-containing aliases (see the tests
    // above) don't have this problem.
    await expectFormulaError(evaluateFormulaWithVariables({ qty: 40 }, 'qty'), 'VALUE')
  })

  it('an unknown variable name resolves to #NAME?', async () => {
    await expectFormulaError(evaluateFormulaWithVariables({ total: 100 }, 'total + nonexistent'), 'NAME')
  })

  it('a cell-address-shaped token has nothing backing it and resolves to #REF!', async () => {
    await expectFormulaError(evaluateFormulaWithVariables({ total: 100 }, 'A1'), 'REF')
  })

  it('a range token has nothing backing it and resolves to #REF!', async () => {
    await expectFormulaError(evaluateFormulaWithVariables({ total: 100 }, 'SUM(A1:A5)'), 'REF')
  })

  it('a disallowed function is still blocked by the same allowlist as evaluateExpression', async () => {
    await expectFormulaError(evaluateFormulaWithVariables({ x: 1 }, 'SUBTOTAL(9,x)'), 'NAME')
  })

  it('an empty variables map still evaluates a literal formula', async () => {
    expect(await evaluateFormulaWithVariables({}, '1+2')).toBe(3)
  })
})
