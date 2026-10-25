// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

afterEach(cleanup)

// jsdom has no ResizeObserver; Radix's Select mounts one.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

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

describe('empty answers', () => {
  const emptySchema: JsonSchema = {
    type: 'object',
    properties: {
      note: { type: 'string', title: 'Note' },
      grade: { type: 'string', title: 'Grade', enum: ['A', 'B'] },
    },
  }
  const fields = {
    type: 'VerticalLayout',
    elements: [
      { type: 'Control', scope: '#/properties/note', options: { placeholder: 'e.g. fragile' } },
      { type: 'Control', scope: '#/properties/grade' },
    ],
  }
  const renderEmpty = (uischema: unknown, readonly = false) =>
    render(
      <Theme>
        <JsonForms
          schema={emptySchema}
          uischema={uischema as UISchemaElement}
          data={{}}
          renderers={radixRenderers}
          readonly={readonly}
        />
      </Theme>,
    )

  it('says "Not provided" for an empty field in a read-only form, marked for the host', () => {
    renderEmpty(fields, true)

    const note = screen.getByLabelText('Note')
    expect(note.getAttribute('placeholder')).toBe('Not provided')
    expect(note.hasAttribute('data-empty-answer')).toBe(true)
    expect(screen.getByText('Not provided').closest('[data-empty-answer]')).not.toBeNull()
  })

  it("keeps the field's own placeholder where it can be filled in", () => {
    renderEmpty(fields)

    const note = screen.getByLabelText('Note')
    expect(note.getAttribute('placeholder')).toBe('e.g. fragile')
    expect(note.hasAttribute('data-empty-answer')).toBe(false)
    expect(screen.queryByText('Not provided')).toBeNull()
  })

  it('says "Not provided" on a stepper\'s review step', () => {
    renderEmpty({
      type: 'Categorization',
      options: { variant: 'stepper' },
      elements: [{ type: 'Category', label: 'Details', elements: fields.elements }],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByLabelText('Note').getAttribute('placeholder')).toBe('Not provided')
  })
})
