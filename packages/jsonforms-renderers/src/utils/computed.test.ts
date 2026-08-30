import { describe, expect, it } from 'vitest'
import { evaluateComputedFormula, formatComputedValue, resolveComputedInputs } from './computed'

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
    expect(
      resolveComputedInputs(rootData, 'blendsheet_data.0', { qty: 'quality_to_be_exported' }),
    ).toEqual({ qty: 16128 })
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

describe('evaluateComputedFormula', () => {
  it('evaluates arithmetic over the resolved values', async () => {
    const result = await evaluateComputedFormula({ total_sales: 27000, total_imported: 5000 }, 'total_sales + total_imported')
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
})
