// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

afterEach(cleanup)

const schema: JsonSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string' },
    physical: { type: 'string' },
    salmonella: { type: 'string' },
  },
}

const control = (name: string, label: string) => ({ type: 'Control', scope: `#/properties/${name}`, label })

// SHOW the element when `kind` is one of kinds.
const showFor = (kinds: string[]) => ({
  effect: 'SHOW',
  condition: { scope: '#/properties/kind', schema: { enum: kinds } },
})

function renderForm(uischema: unknown, data: Record<string, unknown>) {
  render(
    <Theme>
      <JsonForms schema={schema} uischema={uischema as UISchemaElement} data={data} renderers={radixRenderers} />
    </Theme>,
  )
}

describe('layout rules', () => {
  const groups = {
    type: 'VerticalLayout',
    elements: [
      {
        type: 'Group',
        label: 'Physical Group',
        rule: showFor(['P', 'PS']),
        elements: [control('physical', 'Physical No.')],
      },
      {
        type: 'Group',
        label: 'Salmonella Group',
        rule: showFor(['S', 'PS']),
        elements: [control('salmonella', 'Salmonella No.')],
      },
    ],
  }

  it('shows only the Group whose SHOW rule matches', () => {
    renderForm(groups, { kind: 'P' })

    expect(screen.getByText('Physical Group')).toBeTruthy()
    expect(screen.getByText('Physical No.')).toBeTruthy()
    expect(screen.queryByText('Salmonella Group')).toBeNull()
    expect(screen.queryByText('Salmonella No.')).toBeNull()
  })

  it('shows every Group whose SHOW rule matches', () => {
    renderForm(groups, { kind: 'PS' })

    expect(screen.getByText('Physical Group')).toBeTruthy()
    expect(screen.getByText('Salmonella Group')).toBeTruthy()
  })

  it.each([
    ['VerticalLayout', 'Vertical No.'],
    ['HorizontalLayout', 'Horizontal No.'],
  ])('applies a HIDE rule to a %s', (type, label) => {
    const uischema = {
      type: 'VerticalLayout',
      elements: [
        {
          type,
          rule: { effect: 'HIDE', condition: { scope: '#/properties/kind', schema: { const: 'P' } } },
          elements: [control('physical', label)],
        },
      ],
    }

    renderForm(uischema, { kind: 'P' })
    expect(screen.queryByText(label)).toBeNull()

    cleanup()
    renderForm(uischema, { kind: 'S' })
    expect(screen.getByText(label)).toBeTruthy()
  })
})
