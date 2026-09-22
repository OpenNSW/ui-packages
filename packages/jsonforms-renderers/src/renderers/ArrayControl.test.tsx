import type { ArrayControlProps, ControlElement, JsonSchema } from '@jsonforms/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ArrayControl } from './ArrayControl'

vi.mock('@jsonforms/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@jsonforms/react')>()
  return { ...actual, JsonFormsDispatch: () => null }
})

const itemsSchema: JsonSchema = {
  type: 'object',
  properties: { name: { type: 'string' } },
}

function renderArray(options?: ControlElement['options']) {
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
})
