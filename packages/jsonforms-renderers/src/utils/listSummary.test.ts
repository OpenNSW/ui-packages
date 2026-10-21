import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@jsonforms/core'
import { listTotals, summarizeRow } from './listSummary'

const items: JsonSchema = {
  type: 'object',
  properties: { grade: { oneOf: [{ const: 'FINE', title: 'Fine' }] }, bags: { type: 'number' }, kg: {} },
}

describe('summarizeRow', () => {
  it("shows options by title and numbers with the locale's separators", () => {
    expect(summarizeRow('{grade} · {bags} bags', { grade: 'FINE', bags: 12500 }, items, 'en')).toBe(
      'Fine · 12,500 bags',
    )
  })

  it('leaves out a segment whose values are all empty, never showing a placeholder', () => {
    expect(summarizeRow('{grade} · {bags} bags · {kg} kg', { grade: 'FINE' }, items, 'en')).toBe('Fine')
    expect(summarizeRow('{grade} · {bags} bags', {}, items, 'en')).toBe('')
  })
})

describe('summarizeRow with nested and object values', () => {
  const nested: JsonSchema = {
    type: 'object',
    properties: {
      name: { type: 'object', properties: { value: { type: 'string' }, label: { type: 'string' } } },
      unit: {
        type: 'object',
        properties: { value: { type: 'string', oneOf: [{ const: 'KGM', title: 'kilogram (kg)' }] } },
      },
      tarification: { type: 'object', properties: { hsCode: { type: 'string' } } },
    },
  }

  it("reads dotted paths, a search pick's label, and a { value } option's title", () => {
    const row = { name: { value: 'c1', label: 'Cinnamon' }, unit: { value: 'KGM' }, tarification: { hsCode: '0906' } }
    expect(summarizeRow('{name} · {tarification.hsCode} · {unit}', row, nested, 'en')).toBe(
      'Cinnamon · 0906 · kilogram (kg)',
    )
  })
})

describe('listTotals', () => {
  it('sums each field across the rows, numeric strings included', () => {
    expect(listTotals([{ bags: 500 }, { bags: '240' }], [{ field: 'bags', label: '{sum} bags' }], 'en')).toEqual([
      '740 bags',
    ])
  })

  it('sums a nested field', () => {
    expect(listTotals([{ v: { kg: 1.5 } }, { v: { kg: 2 } }], [{ field: 'v.kg', label: '{sum} kg' }], 'en')).toEqual([
      '3.5 kg',
    ])
  })

  it('leaves out a total no row has a number for', () => {
    expect(listTotals([{ bags: '' }], [{ field: 'bags', label: '{sum} bags' }], 'en')).toEqual([])
  })
})
