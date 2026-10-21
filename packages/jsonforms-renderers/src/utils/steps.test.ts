import { describe, expect, it } from 'vitest'
import type { ControlElement, JsonSchema } from '@jsonforms/core'
import { type FormError, hasAnswers, isStepperUiSchema, stepProblems, stepSummary } from './steps'

// AJV-shaped errors, as JSON Forms keeps them; only the fields the step checks read.
const error = (instancePath: string, keyword: string, params: Record<string, unknown> = {}) =>
  ({ instancePath, keyword, params, schemaPath: '', message: '' }) as FormError

describe('isStepperUiSchema', () => {
  it('matches only a Categorization with the stepper variant', () => {
    expect(isStepperUiSchema({ type: 'Categorization', options: { variant: 'stepper' } })).toBe(true)
    expect(isStepperUiSchema({ type: 'Categorization' })).toBe(false)
    expect(isStepperUiSchema({ type: 'VerticalLayout', options: { variant: 'stepper' } })).toBe(false)
    expect(isStepperUiSchema(null)).toBe(false)
  })
})

describe('stepProblems', () => {
  const schema: JsonSchema = { type: 'object', properties: { a: { type: 'string', title: 'Alpha' }, rows: {} } }
  const controls: ControlElement[] = [
    { type: 'Control', scope: '#/properties/a' },
    { type: 'Control', scope: '#/properties/rows', label: 'Items' },
  ]

  it("names each control the form's errors point at, once, nested errors counting for their control", () => {
    const errors = [
      error('', 'required', { missingProperty: 'a' }),
      error('/rows/0', 'required', { missingProperty: 'x' }),
      error('/rows/1/y', 'type'),
      error('', 'required', { missingProperty: 'elsewhere' }),
    ]
    expect(stepProblems(controls, errors, schema)).toEqual([
      { path: 'a', label: 'Alpha' },
      { path: 'rows', label: 'Items' },
    ])
  })

  it('finds nothing without errors: it adds no checks of its own', () => {
    expect(stepProblems(controls, [], schema)).toEqual([])
  })
})

describe('stepSummary', () => {
  const ctl = (name: string): ControlElement => ({ type: 'Control', scope: `#/properties/${name}` })

  it('counts the rows of a list on the step', () => {
    expect(stepSummary([ctl('rows')], { rows: [{}, {}] })).toEqual({ kind: 'items', count: 2 })
    expect(stepSummary([ctl('rows')], { rows: [{}] })).toEqual({ kind: 'items', count: 1 })
  })

  it('otherwise counts its fields', () => {
    expect(stepSummary([ctl('a'), ctl('rows')], { rows: [] })).toEqual({ kind: 'fields', count: 2 })
  })
})

describe('a Categorization below the data root', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { rows: { type: 'array', items: { type: 'object', required: ['qty'], properties: { qty: {} } } } },
  }
  const qty: ControlElement = { type: 'Control', scope: '#/properties/qty', label: 'Quantity' }

  it('matches root-relative errors to its controls', () => {
    const errors = [error('/rows/1', 'required', { missingProperty: 'qty' })]
    expect(stepProblems([qty], errors, schema, 'rows.1')).toEqual([{ path: 'rows.1.qty', label: 'Quantity' }])
    expect(stepProblems([qty], errors, schema, 'rows.0')).toEqual([])
  })

  it('reads its answers at its own path', () => {
    expect(hasAnswers([qty], { rows: [{}, { qty: '2' }] }, 'rows.1')).toBe(true)
    expect(hasAnswers([qty], { rows: [{}, { qty: '2' }] }, 'rows.0')).toBe(false)
  })
})
