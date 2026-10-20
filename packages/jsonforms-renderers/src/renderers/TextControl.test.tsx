// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonFormsCore, JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

afterEach(cleanup)

const schema: JsonSchema = {
  type: 'object',
  properties: { name: { type: 'string', title: 'Name' } },
  required: ['name'],
}
const uischema = { type: 'Control', scope: '#/properties/name' } as UISchemaElement

describe('TextControl', () => {
  it('stores a cleared field as no value, so a required one is missing again', async () => {
    let last: Pick<JsonFormsCore, 'data' | 'errors'> = { data: undefined, errors: [] }
    render(
      <Theme>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={{ name: 'Ada' }}
          renderers={radixRenderers}
          onChange={(state) => (last = state)}
        />
      </Theme>,
    )

    fireEvent.change(screen.getByLabelText('Name', { exact: false }), { target: { value: '' } })
    // JsonForms reports changes after a short debounce.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    expect(last.data).not.toHaveProperty('name')
    expect(last.errors?.some((e) => e.keyword === 'required')).toBe(true)
  })
})
