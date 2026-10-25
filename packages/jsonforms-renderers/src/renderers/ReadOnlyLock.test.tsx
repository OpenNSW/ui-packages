// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

afterEach(cleanup)

const schema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    hsCode: { type: 'string', title: 'HS code', readOnly: true },
    weight: { type: 'number', title: 'Weight', readOnly: true },
    shipped: { type: 'string', format: 'date', title: 'Shipped', readOnly: true },
  },
}
const control = (name: string) => ({ type: 'Control', scope: `#/properties/${name}` })
const flat = { type: 'VerticalLayout', elements: ['name', 'hsCode', 'weight', 'shipped'].map(control) }
const data = { name: 'A', hsCode: '0801.11', weight: 10, shipped: '2026-10-01' }

const renderForm = (uischema: unknown, readonly = false) =>
  render(
    <Theme>
      <JsonForms
        schema={schema}
        uischema={uischema as UISchemaElement}
        data={data}
        renderers={radixRenderers}
        readonly={readonly}
      />
    </Theme>,
  )
const locks = () => screen.queryAllByTestId('read-only-lock')

describe('read-only lock', () => {
  it('marks each read-only field in an editable form, and not the editable one', () => {
    renderForm(flat)

    expect(locks()).toHaveLength(3)
    const name = screen.getByLabelText('Name')
    expect(name.closest('.rt-TextFieldRoot')?.querySelector('[data-testid="read-only-lock"]')).toBeNull()
  })

  it('marks nothing in a form that is read-only throughout', () => {
    renderForm(flat, true)

    expect(locks()).toHaveLength(0)
  })

  it("marks nothing on a stepper's review step", () => {
    renderForm({
      type: 'Categorization',
      options: { variant: 'stepper' },
      elements: [{ type: 'Category', label: 'Details', elements: flat.elements }],
    })
    expect(locks()).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: 'Review and Submit' })).toBeTruthy()
    expect(locks()).toHaveLength(0)
  })
})
