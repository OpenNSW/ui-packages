// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

// Exercised through a real JsonForms tree, like SpreadsheetControl.test.tsx —
// this is a Control renderer selected by schema keyword, not a standalone
// component, so what matters is what actually gets wired up for a given
// scope/options combination. This control never reads its own scoped data
// (writeTo is mandatory and always assembles the document from elsewhere)
// and never writes to form data either.

vi.mock('../utils/download', () => ({
  downloadTextFile: vi.fn(),
}))
import { downloadTextFile } from '../utils/download'

type Data = Record<string, unknown>

const finishers: (() => void)[] = []
afterEach(() => {
  for (const stop of finishers) stop()
  finishers.length = 0
  cleanup()
  vi.clearAllMocks()
})

const uischema = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/doc' }],
} as UISchemaElement

function renderForm(schema: JsonSchema, seed: Data, ui: UISchemaElement = uischema) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })
  function Harness() {
    const [initial] = useState(seed)
    return (
      <Theme>
        <JsonForms
          schema={schema}
          uischema={ui}
          data={initial}
          renderers={radixRenderers}
          onChange={({ data }) => {
            if (live) writes.push(data as Data)
          }}
        />
      </Theme>
    )
  }
  render(<Harness />)
  return { writes }
}

const downloadButton = () => screen.queryByRole('button', { name: /Download XML/ }) as HTMLButtonElement | null

describe('XmlExportControl config validation', () => {
  function makeSchema(xXmlExport: Record<string, unknown>): JsonSchema {
    return {
      type: 'object',
      properties: {
        source: { type: 'string' },
        invoiceExport: { type: 'object', 'x-xml-export': xXmlExport },
      },
    } as unknown as JsonSchema
  }
  const ui = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/invoiceExport' }],
  } as UISchemaElement

  it('shows an inline config error instead of a button when writeTo is missing', async () => {
    renderForm(makeSchema({ rootElement: 'Invoice' }), { source: 'Acme' }, ui)

    await waitFor(() => expect(screen.getByText(/Invalid x-xml-export config/)).toBeTruthy())
    expect(downloadButton()).toBeNull()
  })

  it('shows an inline config error when writeTo is declared but empty', async () => {
    renderForm(makeSchema({ writeTo: [] }), { source: 'Acme' }, ui)

    await waitFor(() => expect(screen.getByText(/writeTo is declared but empty/)).toBeTruthy())
    expect(downloadButton()).toBeNull()
  })

  it('shows an inline config error when writeTo is not an array', async () => {
    renderForm(makeSchema({ writeTo: 'nope' }), { source: 'Acme' }, ui)

    await waitFor(() => expect(screen.getByText(/writeTo must be an array/)).toBeTruthy())
    expect(downloadButton()).toBeNull()
  })

  it('renders nothing when visible is false, even with an invalid config', async () => {
    const schema = {
      type: 'object',
      properties: {
        invoiceExport: { type: 'object', 'x-xml-export': {} },
        hide: { type: 'boolean' },
      },
    } as unknown as JsonSchema
    const hiddenUischema = {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/invoiceExport',
          rule: { effect: 'HIDE', condition: { scope: '#/properties/hide', schema: { const: true } } },
        },
      ],
    } as UISchemaElement
    renderForm(schema, { hide: true }, hiddenUischema)

    await new Promise((r) => setTimeout(r, 20))
    expect(downloadButton()).toBeNull()
    expect(screen.queryByText(/Invalid x-xml-export config/)).toBeNull()
  })
})

describe('XmlExportControl with writeTo (root-relative, the default)', () => {
  function makeSchema(xXmlExport: Record<string, unknown>): JsonSchema {
    return {
      type: 'object',
      properties: {
        customer: { type: 'object', properties: { name: { type: 'string' } } },
        total: { type: 'number' },
        // Deliberately unrelated to what's mapped — proves the export reads
        // from writeTo's own from paths, not this field's own value.
        invoiceExport: { type: 'object', 'x-xml-export': xXmlExport },
      },
    } as unknown as JsonSchema
  }
  const ui = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/invoiceExport' }],
  } as UISchemaElement

  it('assembles the document from writeTo, ignoring the scoped field itself', async () => {
    renderForm(
      makeSchema({
        rootElement: 'Invoice',
        writeTo: [
          { from: 'customer.name', to: 'Party.Name' },
          { from: 'total', to: 'Amount' },
        ],
      }),
      { customer: { name: 'Acme' }, total: 120, invoiceExport: {} },
      ui,
    )

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(xml).toContain('<Invoice>')
    expect(xml).toContain('<Party>')
    expect(xml).toContain('<Name>Acme</Name>')
    expect(xml).toContain('<Amount>120</Amount>')
  })

  it('is disabled when the whole form is empty, not just the scoped field', async () => {
    renderForm(makeSchema({ writeTo: [{ from: 'customer.name', to: 'Party.Name' }] }), {}, ui)

    await waitFor(() => expect(downloadButton()).toBeTruthy())
    expect(downloadButton()?.disabled).toBe(true)
  })

  it('shows an inline error instead of downloading when an entry cannot be resolved', async () => {
    renderForm(
      makeSchema({ rootElement: 'Invoice', writeTo: [{ to: 'Amount' }] }),
      { customer: { name: 'Acme' }, invoiceExport: {} },
      ui,
    )

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(screen.getByText(/needs either "from" or "formula"/)).toBeTruthy())
    expect(downloadTextFile).not.toHaveBeenCalled()
  })
})

describe('XmlExportControl with nested writeTo (array reshape)', () => {
  function makeSchema(xXmlExport: Record<string, unknown>): JsonSchema {
    return {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: { sku: { type: 'string' }, qty: { type: 'number' } },
          },
        },
        invoiceExport: { type: 'object', 'x-xml-export': xXmlExport },
      },
    } as unknown as JsonSchema
  }
  const ui = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/invoiceExport' }],
  } as UISchemaElement

  it('reshapes each array item into the destination tag names, instead of passing source field names through', async () => {
    renderForm(
      makeSchema({
        rootElement: 'Invoice',
        writeTo: [
          {
            from: 'lines',
            to: 'Lines.Line',
            writeTo: [
              { from: 'sku', to: 'SKU' },
              { from: 'qty', to: 'Quantity' },
            ],
          },
        ],
      }),
      {
        lines: [
          { sku: 'A-1', qty: 10 },
          { sku: 'B-2', qty: 20 },
        ],
        invoiceExport: {},
      },
      ui,
    )

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(xml).toContain('<SKU>A-1</SKU>')
    expect(xml).toContain('<Quantity>10</Quantity>')
    expect(xml).toContain('<SKU>B-2</SKU>')
    expect(xml).toContain('<Quantity>20</Quantity>')
    expect(xml).not.toContain('<sku>')
    expect(xml).not.toContain('<qty>')
  })

  it('still passes rows through with their source field names when no nested writeTo is given', async () => {
    renderForm(
      makeSchema({ rootElement: 'Invoice', writeTo: [{ from: 'lines', to: 'Lines.Line' }] }),
      { lines: [{ sku: 'A-1', qty: 10 }], invoiceExport: {} },
      ui,
    )

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(xml).toContain('<sku>A-1</sku>')
    expect(xml).toContain('<qty>10</qty>')
  })

  it('shows an inline error instead of downloading when a nested writeTo meets a non-array from', async () => {
    renderForm(
      makeSchema({
        rootElement: 'Invoice',
        writeTo: [{ from: 'lines', to: 'Lines.Line', writeTo: [{ from: 'sku', to: 'SKU' }] }],
      }),
      { lines: 'not-an-array', invoiceExport: {} },
      ui,
    )

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(screen.getByText(/did not resolve to a repeating element/)).toBeTruthy())
    expect(downloadTextFile).not.toHaveBeenCalled()
  })
})

describe('XmlExportControl with writeTo and writeBase: parent', () => {
  function makeArraySchema(): JsonSchema {
    return {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              qty: { type: 'number' },
              exporter: {
                type: 'object',
                'x-xml-export': {
                  rootElement: 'Order',
                  writeBase: 'parent',
                  writeTo: [
                    { from: 'id', to: 'Id' },
                    { from: 'qty', to: 'Qty' },
                  ],
                },
              },
            },
          },
        },
      },
    } as unknown as JsonSchema
  }
  const ui = {
    type: 'VerticalLayout',
    elements: [
      {
        type: 'Control',
        scope: '#/properties/orders',
        options: {
          detail: { type: 'VerticalLayout', elements: [{ type: 'Control', scope: '#/properties/exporter' }] },
        },
      },
    ],
  } as UISchemaElement

  it('rebases from paths onto the item the control sits in, not the form root', async () => {
    renderForm(
      makeArraySchema(),
      {
        orders: [
          { id: '1', qty: 2, exporter: {} },
          { id: '2', qty: 5, exporter: {} },
        ],
      },
      ui,
    )

    const buttons = await waitFor(() => {
      const found = screen.getAllByRole('button', { name: /Download XML/ })
      expect(found).toHaveLength(2)
      return found
    })

    fireEvent.click(buttons[1])
    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(xml).toContain('<Id>2</Id>')
    expect(xml).toContain('<Qty>5</Qty>')
    expect(xml).not.toContain('<Id>1</Id>')
  })
})
