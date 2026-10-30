import type { ArrayControlProps, ControlElement, JsonSchema, Translator } from '@jsonforms/core'
import { JsonFormsStateProvider } from '@jsonforms/react'
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

function renderArray(
  options?: ControlElement['options'],
  overrides: Record<string, unknown> = {},
  translate?: Translator,
) {
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
  const control = <ArrayControl {...props} />
  if (!translate) return renderToStaticMarkup(control)
  return renderToStaticMarkup(
    <JsonFormsStateProvider initState={{ core: { data: {}, schema: {}, uischema: {} }, i18n: { translate } }}>
      {control}
    </JsonFormsStateProvider>,
  )
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

  it('hides the row name when itemLabel is false', () => {
    const html = renderArray({ itemLabel: false })
    expect(html).not.toContain('Item 1')
    expect(html).not.toContain('Item 2')
    expect(html).not.toContain('Container 1')
  })

  it('spells the row number when itemNumber is word', () => {
    const html = renderArray({ itemLabel: 'Attachment', itemNumber: 'word' })
    expect(html).toContain('Attachment One')
    expect(html).toContain('Attachment Two')
    expect(html).not.toContain('Attachment 1')
  })

  it('uses addLabel and emptyLabel, and hides the heading when label is empty', () => {
    const html = renderArray(
      {
        addLabel: 'Add Attachment',
        emptyLabel: 'No attachments have been added yet.',
      },
      {
        data: [],
        label: '',
        schema: { type: 'array', title: 'Attachments', items: itemsSchema },
      },
    )
    expect(html).toContain('Add Attachment')
    expect(html).toContain('No attachments have been added yet.')
    expect(html).not.toContain('Attachments')
    expect(html).not.toContain('Add Item')
  })

  it('hides the heading when the control label is false, even if a translation was passed in', () => {
    const html = renderArray(undefined, {
      label: 'Pièces jointes',
      schema: { type: 'array', title: 'Attachments', items: itemsSchema },
      uischema: { type: 'Control', scope: '#/properties/attachments', label: false, i18n: 'attachments' },
    })
    expect(html).not.toContain('Pièces jointes')
    expect(html).not.toContain('Attachments')
  })

  it('uses a string label in place of the schema title', () => {
    const html = renderArray(undefined, {
      label: 'Supporting documents',
      schema: { type: 'array', title: 'Attachments', items: itemsSchema },
    })
    expect(html).toContain('Supporting documents')
    expect(html).not.toContain('Attachments')
  })

  it('keeps the required mark on the heading, and names the schema title in the error when the heading is hidden', () => {
    const shown = renderArray(undefined, {
      label: 'Supporting documents',
      required: true,
      schema: { type: 'array', title: 'Attachments', items: itemsSchema },
    })
    expect(shown).toContain('Supporting documents')
    expect(shown).toContain('*')

    const hidden = renderArray(undefined, {
      data: [],
      label: '',
      required: true,
      errors: 'is a required property',
      schema: { type: 'array', title: 'Attachments', items: itemsSchema },
    })
    expect(hidden).toContain('Attachments is required')
    expect(hidden).not.toContain('*')
  })

  it('uses a per-control translation before the global list key, and a literal label before either', () => {
    const translate = ((id: string, defaultMessage?: string) => {
      if (id === 'attachments.list.addItem') return 'Ajouter une pièce jointe'
      if (id === 'attachments.list.empty') return 'Aucune pièce jointe.'
      if (id === 'list.addItem') return 'Ajouter'
      if (id === 'list.empty') return 'Rien.'
      return defaultMessage
    }) as Translator
    const html = renderArray(
      undefined,
      {
        data: [],
        uischema: { type: 'Control', scope: '#/properties/attachments', i18n: 'attachments' },
      },
      translate,
    )
    expect(html).toContain('Ajouter une pièce jointe')
    expect(html).toContain('Aucune pièce jointe.')
    expect(html).not.toContain('Add Item')
    expect(html).not.toContain('Rien.')

    const literal = renderArray(
      undefined,
      {
        data: [],
        uischema: {
          type: 'Control',
          scope: '#/properties/attachments',
          i18n: 'attachments',
          options: { addLabel: 'Add Attachment', emptyLabel: 'None yet.' },
        },
      },
      translate,
    )
    expect(literal).toContain('Add Attachment')
    expect(literal).toContain('None yet.')
    expect(literal).not.toContain('Ajouter une pièce jointe')
  })

  it('falls back to the global list key when the control has no translation of its own', () => {
    const translate = ((id: string, defaultMessage?: string) =>
      id === 'list.empty' ? 'Rien.' : defaultMessage) as Translator
    const html = renderArray(
      undefined,
      {
        data: [],
        uischema: { type: 'Control', scope: '#/properties/attachments', i18n: 'attachments' },
      },
      translate,
    )
    expect(html).toContain('Rien.')
    expect(html).toContain('Add Item')
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
