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
    expect(stepProblems([controls], errors, schema)).toEqual([
      [
        { path: 'a', label: 'Alpha' },
        { path: 'rows', label: 'Items' },
      ],
    ])
  })

  it('finds nothing without errors: it adds no checks of its own', () => {
    expect(stepProblems([controls], [], schema)).toEqual([[]])
  })
})

describe('stepProblems for an object not started yet', () => {
  // AJV reports a missing object once, on the object, not on its fields.
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      transport: {
        type: 'object',
        required: ['vessel', 'mode'],
        properties: { note: { title: 'Note' }, vessel: { title: 'Vessel' }, mode: { title: 'Mode' }, flag: {} },
      },
      traders: {
        type: 'object',
        required: ['exporter', 'agent'],
        properties: {
          notes: {},
          exporter: { type: 'object', required: ['name'], properties: { tin: {}, name: { title: 'Exporter name' } } },
          agent: { type: 'object', properties: { code: { title: 'Agent code' }, phone: {} } },
        },
      },
      extra: { type: 'object', properties: { a: { title: 'A' }, b: {} } },
      charges: {
        type: 'object',
        required: ['total'],
        properties: { total: {}, remarks: { title: 'Remarks' }, 'a/b': { title: 'Slashed' } },
      },
      app: { type: 'object', required: ['transport'], properties: { transport: { $ref: '#/properties/transport' } } },
    },
  }
  const ctl = (scope: string): ControlElement => ({ type: 'Control', scope })
  const at = (path: string) => ctl(`#/properties/${path.split('.').join('/properties/')}`)
  const missing = (name: string, parent = '') => error(parent, 'required', { missingProperty: name })
  const paths = (problems: { path: string }[][]) => problems.map((step) => step.map((p) => p.path))

  it('flags every field the object requires, on whichever step shows it', () => {
    const steps = [[at('transport.note'), at('transport.vessel')], [at('transport.flag')], [at('transport.mode')]]
    expect(stepProblems(steps, [missing('transport')], schema)).toEqual([
      [{ path: 'transport.vessel', label: 'Vessel' }],
      [],
      [{ path: 'transport.mode', label: 'Mode' }],
    ])
  })

  it('follows required into nested objects, and stands in for one that requires none of its fields', () => {
    const steps = [
      [at('traders.notes')],
      [at('traders.exporter.tin'), at('traders.exporter.name')],
      [at('traders.agent.phone'), at('traders.agent.code')],
    ]
    expect(paths(stepProblems(steps, [missing('traders')], schema))).toEqual([
      [],
      ['traders.exporter.name'],
      ['traders.agent.phone'],
    ])
  })

  it('names the first field of an object that requires none', () => {
    expect(stepProblems([[at('extra.a'), at('extra.b')]], [missing('extra')], schema)).toEqual([
      [{ path: 'extra.a', label: 'A' }],
    ])
  })

  it("names the object's first field on a step when no step shows a field it requires", () => {
    const steps = [[at('transport.vessel')], [at('charges.remarks'), at('charges.a~1b')]]
    expect(paths(stepProblems(steps, [missing('charges')], schema))).toEqual([[], ['charges.remarks']])
  })

  it('reads an escaped property name as the schema spells it', () => {
    const slashed = {
      ...schema,
      properties: {
        ...schema.properties,
        charges: { type: 'object', required: ['a/b'], properties: { remarks: {}, 'a/b': { title: 'Slashed' } } },
      },
    } as JsonSchema
    expect(stepProblems([[at('charges.remarks'), at('charges.a~1b')]], [missing('charges')], slashed)).toEqual([
      [{ path: 'charges.a/b', label: 'Slashed' }],
    ])
  })

  it('leaves a started object alone when another of its checks fails', () => {
    // A failed if/then also reports `if` on the object, with the real error on its field.
    const errors = [missing('flag', '/transport'), error('/transport', 'if'), error('/transport', 'minProperties')]
    const steps = [[at('transport.vessel')], [at('transport.flag')]]
    expect(paths(stepProblems(steps, errors, schema))).toEqual([[], ['transport.flag']])
  })

  it('reads the schema at the data path when the Categorization sits below the root', () => {
    const steps = [[at('note'), at('vessel')], [at('mode')]]
    expect(paths(stepProblems(steps, [missing('transport', '/app')], schema, 'app.transport'))).toEqual([
      ['app.transport.vessel'],
      ['app.transport.mode'],
    ])
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
    expect(stepProblems([[qty]], errors, schema, 'rows.1')).toEqual([[{ path: 'rows.1.qty', label: 'Quantity' }]])
    expect(stepProblems([[qty]], errors, schema, 'rows.0')).toEqual([[]])
  })

  it('reads its answers at its own path', () => {
    expect(hasAnswers([qty], { rows: [{}, { qty: '2' }] }, 'rows.1')).toBe(true)
    expect(hasAnswers([qty], { rows: [{}, { qty: '2' }] }, 'rows.0')).toBe(false)
  })
})
