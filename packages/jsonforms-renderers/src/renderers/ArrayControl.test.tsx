import type { ArrayControlProps, ControlElement, JsonSchema } from '@jsonforms/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ArrayControl } from './ArrayControl'

vi.mock('@jsonforms/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jsonforms/react')>()
  return { ...actual, JsonFormsDispatch: () => null }
})

// Unit tests render ArrayControl without a JsonForms provider; pass through
// the static `required` prop so asterisk assertions stay meaningful.
vi.mock('../hooks/useIsRequired', () => ({
  useIsRequired: (_path: string, staticRequired = false) => staticRequired,
}))

const itemsSchema: JsonSchema = {
  type: 'object',
  properties: { name: { type: 'string' } },
}

function renderArray(options?: ControlElement['options'], overrides: Record<string, unknown> = {}) {
  // Cast once at the boundary: JsonSchema includes draft-04 shapes that are not
  // assignable to ArrayControlProps' JsonSchema7 fields (e.g. exclusiveMaximum).
  const props = {
    data: [{ name: 'a' }, { name: 'b' }],
    path: 'items',
    schema: { type: 'array', items: itemsSchema },
    uischema: { type: 'Control', scope: '#/properties/items', options },
    enabled: true,
    visible: true,
    addItem: () => () => undefined,
    removeItems: () => () => undefined,
    rootSchema: {},
    required: false,
    errors: '',
    ...overrides,
  } as unknown as ArrayControlProps
  return renderToStaticMarkup(<ArrayControl {...props} />)
}

describe('ArrayControl itemLabel', () => {
  it('renders Container 1 / Container 2 when options.itemLabel is set', () => {
    const html = renderArray({ itemLabel: 'Container' })
    expect(html).toContain('Container 1')
    expect(html).toContain('Container 2')
    expect(html).not.toContain('Item 1')
  })

  it('falls back to Item 1 when the option is absent', () => {
    const html = renderArray()
    expect(html).toContain('Item 1')
    expect(html).toContain('Item 2')
    expect(html).not.toContain('Container 1')
  })

  it('spells the row number when itemOrdinal is word', () => {
    const html = renderArray({ itemLabel: 'Attachment', itemOrdinal: 'word' })
    expect(html).toContain('Attachment One')
    expect(html).toContain('Attachment Two')
    expect(html).not.toContain('Attachment 1')
  })

  it('uses addLabel and emptyLabel, and hides the schema title when showTitle is false', () => {
    const html = renderArray(
      {
        showTitle: false,
        addLabel: 'Add Attachment',
        emptyLabel: 'No attachments have been added yet.',
      },
      {
        data: [],
        schema: { type: 'array', title: 'Attachments', items: itemsSchema },
      },
    )
    expect(html).toContain('Add Attachment')
    expect(html).toContain('No attachments have been added yet.')
    expect(html).not.toContain('Attachments')
    expect(html).not.toContain('Add Item')
  })
})

describe('ArrayControl required and errors', () => {
  it('shows a red asterisk when required', () => {
    const html = renderArray(undefined, {
      required: true,
      schema: { type: 'array', title: 'Commodities List', items: itemsSchema },
    })
    expect(html).toContain('Commodities List')
    expect(html).toContain('*')
  })

  it('shows a red asterisk when minItems is at least 1', () => {
    const html = renderArray(undefined, {
      schema: itemsSchema,
      arraySchema: { type: 'array', title: 'Commodities List', minItems: 1, items: itemsSchema },
    })
    expect(html).toContain('*')
  })

  it('renders options.errorMessage when the array is empty and has errors', () => {
    const message = 'At least one commodity must be added before submitting the Phytosanitary Certificate application'
    const html = renderArray(
      { errorMessage: message },
      {
        data: [],
        errors: 'is a required property',
        schema: itemsSchema,
        arraySchema: { type: 'array', title: 'Commodities List', minItems: 1, items: itemsSchema },
      },
    )
    expect(html).toContain(message)
  })

  it('does not use options.errorMessage for non-empty array errors', () => {
    const message = 'At least one commodity must be added before submitting the Phytosanitary Certificate application'
    const html = renderArray(
      { errorMessage: message },
      {
        data: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
        errors: 'must NOT have more than 2 items',
        schema: itemsSchema,
        arraySchema: {
          type: 'array',
          title: 'Commodities List',
          minItems: 1,
          maxItems: 2,
          items: itemsSchema,
        },
      },
    )
    expect(html).not.toContain(message)
    expect(html).toContain('must NOT have more than 2 items')
  })
})
