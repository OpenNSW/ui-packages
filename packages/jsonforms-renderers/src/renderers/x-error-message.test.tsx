// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import { defaultErrorTranslator, type ErrorTranslator, type JsonSchema, type UISchemaElement } from '@jsonforms/core'

import { radixRenderers } from './index'
import { schemaErrorMessage } from '../utils/schemaErrorMessage'

afterEach(cleanup)

// Radix measures some components with ResizeObserver, which jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const PHONE_MESSAGE = 'Enter a 10-digit number, or + and 11 digits.'
const DOCUMENTS_MESSAGE = 'Add a proof of address to the documents.'

const schema = {
  type: 'object',
  properties: {
    phone: { type: 'string', title: 'Phone', pattern: '^[0-9]{10}$', 'x-error-message': PHONE_MESSAGE },
    deliveryMethod: { type: 'string', title: 'Delivery Method', enum: ['courier', 'pickup'] },
    documents: {
      type: 'array',
      title: 'Documents',
      items: { type: 'object', properties: { type: { type: 'string', title: 'Type' } } },
    },
  },
  if: { properties: { deliveryMethod: { const: 'courier' } }, required: ['deliveryMethod'] },
  then: {
    'x-error-message': DOCUMENTS_MESSAGE,
    required: ['documents'],
    properties: {
      documents: { contains: { properties: { type: { const: 'Proof of address' } }, required: ['type'] } },
    },
  },
} as JsonSchema

const uischema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/phone' },
    { type: 'Control', scope: '#/properties/deliveryMethod' },
    { type: 'Control', scope: '#/properties/documents' },
  ],
} as UISchemaElement

const translateError: ErrorTranslator = (error, translate, ui) =>
  schemaErrorMessage(error, schema) ?? defaultErrorTranslator(error, translate, ui)

function renderForm(data: Record<string, unknown>) {
  render(
    <Theme>
      <JsonForms
        schema={schema}
        uischema={uischema}
        data={data}
        renderers={radixRenderers}
        i18n={{ translateError }}
        validationMode="ValidateAndShow"
      />
    </Theme>,
  )
}

describe('x-error-message in a form', () => {
  it("shows a field's message instead of the pattern", () => {
    renderForm({ phone: 'abc' })

    expect(screen.getByText(PHONE_MESSAGE)).toBeTruthy()
    expect(screen.queryByText(/must match pattern/)).toBeNull()
  })

  it("shows a then's message on the list when no item matches", () => {
    renderForm({ deliveryMethod: 'courier', documents: [{ type: 'Invoice' }] })

    expect(screen.getAllByText(DOCUMENTS_MESSAGE)).toHaveLength(1)
    expect(screen.queryByText(/must contain/)).toBeNull()
  })

  it("shows a then's message on the list when it is missing", () => {
    renderForm({ deliveryMethod: 'courier' })

    expect(screen.getAllByText(DOCUMENTS_MESSAGE)).toHaveLength(1)
    expect(screen.queryByText(/is required/)).toBeNull()
  })

  it('shows nothing when the condition does not hold', () => {
    renderForm({ deliveryMethod: 'pickup' })

    expect(screen.queryByText(DOCUMENTS_MESSAGE)).toBeNull()
  })
})
