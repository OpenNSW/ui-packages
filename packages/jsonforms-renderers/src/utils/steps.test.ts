import { describe, expect, it } from 'vitest'
import type { ControlElement, JsonSchema } from '@jsonforms/core'
import {
  emptyRequiredPaths,
  errorDataPath,
  hasAnswers,
  isRequiredAt,
  isStepperUiSchema,
  stepProblems,
  stepSummary,
} from './steps'

describe('isStepperUiSchema', () => {
  it('matches only a Categorization with the stepper variant', () => {
    expect(isStepperUiSchema({ type: 'Categorization', options: { variant: 'stepper' } })).toBe(true)
    expect(isStepperUiSchema({ type: 'Categorization' })).toBe(false)
    expect(isStepperUiSchema({ type: 'VerticalLayout', options: { variant: 'stepper' } })).toBe(false)
    expect(isStepperUiSchema(null)).toBe(false)
  })
})

describe('errorDataPath', () => {
  it('appends the missing property of a required error', () => {
    expect(errorDataPath({ instancePath: '', keyword: 'required', params: { missingProperty: 'a' } })).toBe('a')
    expect(errorDataPath({ instancePath: '/a/0', keyword: 'required', params: { missingProperty: 'b' } })).toBe('a.0.b')
    expect(errorDataPath({ instancePath: '/a/1/c', keyword: 'minLength' })).toBe('a.1.c')
  })
})

describe('emptyRequiredPaths', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['name', 'tags'],
    properties: {
      name: { type: 'string' },
      tags: { type: 'array' },
      rows: { type: 'array', items: { type: 'object', required: ['qty'], properties: { qty: { type: 'string' } } } },
    },
  }

  it('finds present but empty required values, nested ones included', () => {
    expect(emptyRequiredPaths(schema, { name: ' ', tags: [], rows: [{ qty: 'x' }, { qty: '' }] })).toEqual([
      'name',
      'tags',
      'rows.1.qty',
    ])
  })

  it('leaves absent values to AJV', () => {
    expect(emptyRequiredPaths(schema, {})).toEqual([])
  })
})

describe('stepProblems', () => {
  const schema: JsonSchema = { type: 'object', properties: { a: { type: 'string', title: 'Alpha' }, rows: {} } }
  const controls: ControlElement[] = [
    { type: 'Control', scope: '#/properties/a' },
    { type: 'Control', scope: '#/properties/rows', label: 'Items' },
  ]

  it('names each failing control once, nested errors counting for their control', () => {
    const errors = [
      { instancePath: '/rows/0', keyword: 'required', params: { missingProperty: 'x' } },
      { instancePath: '/rows/1/y', keyword: 'type' },
      { instancePath: '', keyword: 'required', params: { missingProperty: 'elsewhere' } },
    ]
    expect(stepProblems(controls, errors, ['a'], schema)).toEqual([
      { path: 'a', label: 'Alpha' },
      { path: 'rows', label: 'Items' },
    ])
  })
})

describe('stepSummary', () => {
  const schema: JsonSchema = { type: 'object', required: ['a'], properties: { a: {}, b: {}, rows: { type: 'array' } } }
  const ctl = (name: string): ControlElement => ({ type: 'Control', scope: `#/properties/${name}` })

  it('counts the rows of a list on the step', () => {
    expect(stepSummary([ctl('rows')], { rows: [{}, {}] }, schema)).toEqual({ kind: 'items', count: 2 })
    expect(stepSummary([ctl('rows')], { rows: [{}] }, schema)).toEqual({ kind: 'items', count: 1 })
  })

  it('counts fields, or says the step is optional', () => {
    expect(stepSummary([ctl('a'), ctl('b')], {}, schema)).toEqual({ kind: 'fields', count: 2 })
    expect(stepSummary([ctl('a')], {}, schema)).toEqual({ kind: 'fields', count: 1 })
    expect(stepSummary([ctl('b'), ctl('rows')], {}, schema)).toEqual({ kind: 'optional' })
  })
})

describe('a Categorization below the data root', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: { rows: { type: 'array', items: { type: 'object', required: ['qty'], properties: { qty: {} } } } },
  }
  const qty: ControlElement = { type: 'Control', scope: '#/properties/qty', label: 'Quantity' }

  it('matches root-relative errors to its controls', () => {
    const errors = [{ instancePath: '/rows/1', keyword: 'required', params: { missingProperty: 'qty' } }]
    expect(stepProblems([qty], errors, [], schema, 'rows.1')).toEqual([{ path: 'rows.1.qty', label: 'Quantity' }])
    expect(stepProblems([qty], errors, [], schema, 'rows.0')).toEqual([])
  })

  it('reads its answers and required fields at its own path', () => {
    expect(hasAnswers([qty], { rows: [{}, { qty: '2' }] }, 'rows.1')).toBe(true)
    expect(hasAnswers([qty], { rows: [{}, { qty: '2' }] }, 'rows.0')).toBe(false)
    expect(stepSummary([qty], {}, schema, 'rows.0')).toEqual({ kind: 'fields', count: 1 })
  })
})

describe('isRequiredAt', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['a'],
    properties: {
      a: { type: 'object', required: ['b'], properties: { b: {}, c: {} } },
      list: { type: 'array', items: { type: 'object', required: ['x'], properties: { x: {} } } },
    },
  }

  it('follows nested objects and array items', () => {
    expect(isRequiredAt(schema, 'a')).toBe(true)
    expect(isRequiredAt(schema, 'a.b')).toBe(true)
    expect(isRequiredAt(schema, 'a.c')).toBe(false)
    expect(isRequiredAt(schema, 'list.0.x')).toBe(true)
    expect(isRequiredAt(schema, 'missing.b')).toBe(false)
  })

  it('makes a step of nested required fields not optional', () => {
    const b: ControlElement = { type: 'Control', scope: '#/properties/a/properties/b' }
    expect(stepSummary([b], {}, schema)).toEqual({ kind: 'fields', count: 1 })
  })
})
