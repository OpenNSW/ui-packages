import { describe, expect, it } from 'vitest'
import { computedInputsError, evaluateComputedFormula, formatComputedValue, resolveComputedInputs } from './computed'

describe('resolveComputedInputs', () => {
  const rootData = {
    blendsheet_data: [
      {
        quality_to_be_exported: 16128,
        total: 41128,
        sales: { derivations: { total_sales: { label: 'Total Sales', value: 27000 } } },
        imported_tea: { derivations: { total_imported: { label: 'Total Imported', value: 5000 } } },
        blend_balances: { derivations: {} },
      },
    ],
  }

  it('resolves a plain manually-entered sibling field', () => {
    expect(resolveComputedInputs(rootData, 'blendsheet_data.0', { qty: 'quality_to_be_exported' })).toEqual({
      qty: 16128,
    })
  })

  it('resolves a nested spreadsheet-derivation value via its map path', () => {
    expect(
      resolveComputedInputs(rootData, 'blendsheet_data.0', { total_sales: 'sales.derivations.total_sales.value' }),
    ).toEqual({ total_sales: 27000 })
  })

  it('resolves a sibling computed field the same way as any other value', () => {
    expect(resolveComputedInputs(rootData, 'blendsheet_data.0', { total: 'total' })).toEqual({ total: 41128 })
  })

  it('combines multiple aliases from different sources in one call', () => {
    expect(
      resolveComputedInputs(rootData, 'blendsheet_data.0', {
        total_sales: 'sales.derivations.total_sales.value',
        total_imported: 'imported_tea.derivations.total_imported.value',
        qty: 'quality_to_be_exported',
      }),
    ).toEqual({ total_sales: 27000, total_imported: 5000, qty: 16128 })
  })

  it('returns undefined (unavailable) when an alias with no default resolves to missing', () => {
    expect(
      resolveComputedInputs(rootData, 'blendsheet_data.0', {
        total_blend_balance: 'blend_balances.derivations.total_blend_balance.value',
      }),
    ).toBeUndefined()
  })

  it('uses the configured default when an alias resolves to missing', () => {
    expect(
      resolveComputedInputs(rootData, 'blendsheet_data.0', {
        total_blend_balance: { path: 'blend_balances.derivations.total_blend_balance.value', default: 0 },
      }),
    ).toEqual({ total_blend_balance: 0 })
  })

  it('a present value is used as-is even when a default is also configured', () => {
    expect(
      resolveComputedInputs(rootData, 'blendsheet_data.0', {
        total_sales: { path: 'sales.derivations.total_sales.value', default: -1 },
      }),
    ).toEqual({ total_sales: 27000 })
  })

  it('empty inputs resolves to an empty object, not undefined', () => {
    expect(resolveComputedInputs(rootData, 'blendsheet_data.0', {})).toEqual({})
  })

  it('short-circuits to undefined on the FIRST missing alias without a default, even with other aliases present', () => {
    expect(
      resolveComputedInputs(rootData, 'blendsheet_data.0', {
        qty: 'quality_to_be_exported',
        missing: 'does_not_exist',
      }),
    ).toBeUndefined()
  })

  it('works with an empty parentPath (a root-level control)', () => {
    expect(resolveComputedInputs({ a: 5 }, '', { a: 'a' })).toEqual({ a: 5 })
  })
})

describe('resolveComputedInputs with an aggregate', () => {
  const rootData = {
    blendsheet_data: [{ assessed_levy: 300 }, { assessed_levy: 100 }, { assessed_levy: 200 }],
    partial: [{ assessed_levy: 300 }, {}],
    empty: [],
    containers: [{ items: [{ weight: 1 }, { weight: 2 }] }, { items: [{ weight: 3 }] }],
  }
  const levy = (aggregate: 'sum' | 'min' | 'max' | 'average' | 'count') => ({
    total: { path: 'blendsheet_data.*.assessed_levy', aggregate },
  })

  it('sums one field across every array item', () => {
    expect(resolveComputedInputs(rootData, '', levy('sum'))).toEqual({ total: 600 })
  })

  it('takes the min, max, average and count', () => {
    expect(resolveComputedInputs(rootData, '', levy('min'))).toEqual({ total: 100 })
    expect(resolveComputedInputs(rootData, '', levy('max'))).toEqual({ total: 300 })
    expect(resolveComputedInputs(rootData, '', levy('average'))).toEqual({ total: 200 })
    expect(resolveComputedInputs(rootData, '', levy('count'))).toEqual({ total: 3 })
  })

  it('is unavailable when an item has no value and there is no default', () => {
    expect(
      resolveComputedInputs(rootData, '', { total: { path: 'partial.*.assessed_levy', aggregate: 'sum' } }),
    ).toBeUndefined()
  })

  it('uses the default for an item without a value', () => {
    expect(
      resolveComputedInputs(rootData, '', { total: { path: 'partial.*.assessed_levy', aggregate: 'sum', default: 0 } }),
    ).toEqual({ total: 300 })
  })

  it('is 0 for sum and count over an empty array, and unavailable for min, max and average', () => {
    const over = (aggregate: 'sum' | 'min' | 'max' | 'average' | 'count') =>
      resolveComputedInputs(rootData, '', { total: { path: 'empty.*.assessed_levy', aggregate } })
    expect(over('sum')).toEqual({ total: 0 })
    expect(over('count')).toEqual({ total: 0 })
    expect(over('min')).toBeUndefined()
    expect(over('max')).toBeUndefined()
    expect(over('average')).toBeUndefined()
  })

  it('is unavailable when the array itself is missing', () => {
    expect(
      resolveComputedInputs(rootData, '', { total: { path: 'missing.*.assessed_levy', aggregate: 'sum' } }),
    ).toBeUndefined()
  })

  it('expands more than one * across nested arrays', () => {
    expect(
      resolveComputedInputs(rootData, '', { total: { path: 'containers.*.items.*.weight', aggregate: 'sum' } }),
    ).toEqual({ total: 6 })
  })

  it('resolves the path relative to the parent, like any other input', () => {
    expect(resolveComputedInputs({ form: rootData }, 'form', levy('sum'))).toEqual({ total: 600 })
  })

  it('treats a * without an aggregate, or the reverse, as missing', () => {
    expect(resolveComputedInputs(rootData, '', { total: 'blendsheet_data.*.assessed_levy' })).toBeUndefined()
    expect(
      resolveComputedInputs(rootData, '', { total: { path: 'blendsheet_data.0.assessed_levy', aggregate: 'sum' } }),
    ).toBeUndefined()
  })
})

describe('computedInputsError', () => {
  it('accepts plain inputs and a * with an aggregate', () => {
    expect(
      computedInputsError({
        price: 'unit_price',
        discount: { path: 'discount', default: 0 },
        total: { path: 'rows.*.amount', aggregate: 'sum' },
      }),
    ).toBeUndefined()
  })

  it('reports a * without an aggregate', () => {
    expect(computedInputsError({ total: 'rows.*.amount' })).toBe('Input "total" has a * in its path but no aggregate.')
    expect(computedInputsError({ total: { path: 'rows.*.amount' } })).toBe(
      'Input "total" has a * in its path but no aggregate.',
    )
  })

  it('reports an aggregate without a *', () => {
    expect(computedInputsError({ total: { path: 'rows.0.amount', aggregate: 'sum' } })).toBe(
      'Input "total" has an aggregate but no * in its path.',
    )
  })

  it('reports an unknown aggregate', () => {
    expect(computedInputsError({ total: { path: 'rows.*.amount', aggregate: 'median' as unknown as 'sum' } })).toBe(
      'Input "total" has an unknown aggregate "median"; use one of sum, min, max, average, count.',
    )
  })
})

describe('evaluateComputedFormula', () => {
  it('evaluates arithmetic over the resolved values', async () => {
    const result = await evaluateComputedFormula(
      { total_sales: 27000, total_imported: 5000 },
      'total_sales + total_imported',
    )
    expect(result).toEqual({ status: 'ok', value: 32000 })
  })

  it('surfaces an unknown-name error as #NAME?', async () => {
    const result = await evaluateComputedFormula({ total: 100 }, 'total + nonexistent_alias')
    expect(result.status).toBe('error')
    expect(result.error).toBe('#NAME?')
  })

  it('surfaces a division-by-zero error as #DIV/0!', async () => {
    const result = await evaluateComputedFormula({ total: 100, divisor: 0 }, 'total / divisor')
    expect(result.status).toBe('error')
    expect(result.error).toBe('#DIV/0!')
  })

  it('never throws even for a malformed formula', async () => {
    await expect(evaluateComputedFormula({}, '')).resolves.toEqual({ status: 'error', error: '#ERROR!' })
  })
})

describe('formatComputedValue', () => {
  it('formats a number to the given decimal places', () => {
    expect(formatComputedValue(1234.5, 2)).toBe('1234.50')
    expect(formatComputedValue(810, 2)).toBe('810.00')
  })

  it('formats a Date as a locale date string', () => {
    const date = new Date(2026, 0, 15)
    expect(formatComputedValue(date, 2)).toBe(date.toLocaleDateString())
  })

  it('stringifies a non-number, non-Date value', () => {
    expect(formatComputedValue('BOP', 2)).toBe('BOP')
    expect(formatComputedValue(true, 2)).toBe('true')
  })

  it('returns an empty string for null/undefined', () => {
    expect(formatComputedValue(null, 2)).toBe('')
    expect(formatComputedValue(undefined, 2)).toBe('')
  })

  it('clamps decimals to [0, 100] instead of letting toFixed throw', () => {
    expect(formatComputedValue(1.25, -1)).toBe('1')
    expect(formatComputedValue(1.25, 0)).toBe('1')
    expect(formatComputedValue(1.25, 100)).toBe((1.25).toFixed(100))
    expect(formatComputedValue(1.25, 101)).toBe((1.25).toFixed(100))
  })

  it('treats a non-finite decimals value as 0', () => {
    expect(formatComputedValue(1.25, NaN)).toBe('1')
  })
})
