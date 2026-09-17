import { type ControlElement, type JsonSchema } from '@jsonforms/core'
import { describe, expect, it, vi } from 'vitest'
import {
  collectControlElements,
  computeAutoFillUpdates,
  computeClearUpdates,
  isTypeCompatible,
  sameValue,
  type AutoFillOptions,
  type AutoTarget,
} from './fillLogic'

const schema: JsonSchema = {
  type: 'object',
  properties: {
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    department: { type: 'string' },
    manager: { type: 'object' },
  },
}

function control(scope: string): ControlElement {
  return { type: 'Control', scope }
}

function target(propertyName: string): AutoTarget {
  return { control: control(`#/properties/${propertyName}`), relativePath: propertyName }
}

const autoTargets: AutoTarget[] = [target('firstName'), target('lastName'), target('department')]

describe('computeAutoFillUpdates', () => {
  it('auto-matches sibling controls by relative path and compatible type', () => {
    const autoFill: AutoFillOptions = { source: 'employeeId' }
    const sourceValue = { firstName: 'Amara', lastName: 'Perera', department: 'Engineering' }

    const updates = computeAutoFillUpdates(autoFill, autoTargets, schema, sourceValue)

    expect(updates).toEqual(
      expect.arrayContaining([
        { path: 'firstName', value: 'Amara' },
        { path: 'lastName', value: 'Perera' },
        { path: 'department', value: 'Engineering' },
      ]),
    )
    expect(updates).toHaveLength(3)
  })

  it('explicit fill entries win over auto-match for the same relative path', () => {
    const autoFill: AutoFillOptions = {
      source: 'employeeId',
      fill: [{ path: 'department', from: 'department.name' }],
    }
    const sourceValue = { firstName: 'Amara', department: { name: 'Engineering' } }

    const updates = computeAutoFillUpdates(autoFill, autoTargets, schema, sourceValue)

    // department comes from the explicit entry (reshaped out of a nested object), not the
    // raw "department" key — auto-match must not also fire for the same target
    expect(updates.filter((u) => u.path === 'department')).toEqual([
      { path: 'department', value: 'Engineering', absolute: undefined },
    ])
    expect(updates).toContainEqual({ path: 'firstName', value: 'Amara' })
  })

  it('skips an auto-match when the source value type is incompatible with the target schema', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const autoFill: AutoFillOptions = { source: 'employeeId' }
    // department schema is a string, but the source hands back a nested object
    const sourceValue = { firstName: 'Amara', department: { name: 'Engineering' } }

    const updates = computeAutoFillUpdates(autoFill, autoTargets, schema, sourceValue)

    expect(updates.find((u) => u.path === 'department')).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('department'))
    warn.mockRestore()
  })

  it('warns and skips an explicit fill entry whose "from" path is not found in the source', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const autoFill: AutoFillOptions = {
      source: 'employeeId',
      fill: [{ path: 'department', from: 'org.department' }],
    }
    const sourceValue = { firstName: 'Amara' }

    const updates = computeAutoFillUpdates(autoFill, autoTargets, schema, sourceValue)

    expect(updates.find((u) => u.path === 'department')).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('org.department'))
    warn.mockRestore()
  })

  it('does not auto-fill a sibling absent from the source value', () => {
    const autoFill: AutoFillOptions = { source: 'employeeId' }
    const sourceValue = { firstName: 'Amara' } // no lastName, no department

    const updates = computeAutoFillUpdates(autoFill, autoTargets, schema, sourceValue)

    expect(updates).toEqual([{ path: 'firstName', value: 'Amara' }])
  })

  it('supports an absolute explicit fill entry that writes outside the group', () => {
    const autoFill: AutoFillOptions = {
      source: 'employeeId',
      fill: [{ path: '/manager/name', from: 'manager.name', absolute: true }],
    }
    const sourceValue = { firstName: 'Amara', manager: { name: 'Dilani' } }

    const updates = computeAutoFillUpdates(autoFill, autoTargets, schema, sourceValue)

    expect(updates).toContainEqual({ path: '/manager/name', value: 'Dilani', absolute: true })
  })

  it("from: '' fills the whole source value wholesale", () => {
    const autoFill: AutoFillOptions = {
      source: 'employeeId',
      fill: [{ path: 'raw', from: '' }],
    }
    const sourceValue = { firstName: 'Amara' }

    const updates = computeAutoFillUpdates(autoFill, autoTargets, schema, sourceValue)

    expect(updates).toContainEqual({ path: 'raw', value: sourceValue, absolute: undefined })
  })
})

describe('computeClearUpdates', () => {
  it('clears fields that still hold what was filled', () => {
    const filled = new Map<string, unknown>([
      ['firstName', 'Amara'],
      ['lastName', 'Perera'],
    ])
    const data = { firstName: 'Amara', lastName: 'Perera' }

    expect(computeClearUpdates(filled, data)).toEqual(expect.arrayContaining(['firstName', 'lastName']))
  })

  it('leaves a field the user has since hand-edited alone', () => {
    const filled = new Map<string, unknown>([
      ['firstName', 'Amara'],
      ['lastName', 'Perera'],
    ])
    // user changed firstName after it was auto-filled
    const data = { firstName: 'Ama', lastName: 'Perera' }

    expect(computeClearUpdates(filled, data)).toEqual(['lastName'])
  })

  it('treats a field that was cleared out-of-band as already handled', () => {
    const filled = new Map<string, unknown>([['firstName', 'Amara']])
    const data = {} // firstName already missing/undefined

    expect(computeClearUpdates(filled, data)).toEqual([])
  })

  it('compares object-shaped fill values structurally, not by reference', () => {
    const filled = new Map<string, unknown>([['manager', { name: 'Dilani' }]])
    const data = { manager: { name: 'Dilani' } } // same shape, different object identity

    expect(computeClearUpdates(filled, data)).toEqual(['manager'])
  })
})

describe('collectControlElements', () => {
  it('finds Control leaves nested inside container layouts', () => {
    const elements = [
      control('#/properties/employeeId'),
      {
        type: 'HorizontalLayout',
        elements: [control('#/properties/firstName'), control('#/properties/lastName')],
      },
      {
        type: 'Group',
        elements: [{ type: 'VerticalLayout', elements: [control('#/properties/department')] }],
      },
    ]

    const found = collectControlElements(elements)

    expect(found.map((c) => c.scope)).toEqual([
      '#/properties/employeeId',
      '#/properties/firstName',
      '#/properties/lastName',
      '#/properties/department',
    ])
  })

  it('does not recurse into a nested AutoFillGroup — it is its own source/fill boundary', () => {
    const elements = [
      control('#/properties/employeeId'),
      {
        type: 'AutoFillGroup',
        elements: [control('#/properties/nestedField')],
      },
    ]

    const found = collectControlElements(elements)

    expect(found.map((c) => c.scope)).toEqual(['#/properties/employeeId'])
  })
})

describe('isTypeCompatible', () => {
  it('allows any value when the schema type is unknown', () => {
    expect(isTypeCompatible(undefined, { anything: true })).toBe(true)
  })

  it('matches primitive types', () => {
    expect(isTypeCompatible('string', 'x')).toBe(true)
    expect(isTypeCompatible('string', 1)).toBe(false)
    expect(isTypeCompatible('number', 1)).toBe(true)
    expect(isTypeCompatible('integer', 1)).toBe(true)
    expect(isTypeCompatible('boolean', true)).toBe(true)
  })

  it('distinguishes object from array', () => {
    expect(isTypeCompatible('object', { a: 1 })).toBe(true)
    expect(isTypeCompatible('object', [1, 2])).toBe(false)
    expect(isTypeCompatible('array', [1, 2])).toBe(true)
    expect(isTypeCompatible('array', { a: 1 })).toBe(false)
  })

  it('matches against any type in a union schema type', () => {
    expect(isTypeCompatible(['string', 'null'], null)).toBe(true)
    expect(isTypeCompatible(['string', 'null'], 'x')).toBe(true)
    expect(isTypeCompatible(['string', 'null'], 1)).toBe(false)
  })
})

describe('sameValue', () => {
  it('compares primitives by value', () => {
    expect(sameValue('a', 'a')).toBe(true)
    expect(sameValue('a', 'b')).toBe(false)
    expect(sameValue(undefined, undefined)).toBe(true)
  })

  it('compares objects structurally regardless of identity', () => {
    expect(sameValue({ a: 1 }, { a: 1 })).toBe(true)
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('treats a primitive and an object as different', () => {
    expect(sameValue('a', { a: 1 })).toBe(false)
    expect(sameValue(null, {})).toBe(false)
  })
})
