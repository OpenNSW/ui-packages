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

// Only the browser download is faked; the file-name helpers next to it stay
// real, since what name gets downloaded is part of what's under test.
vi.mock('../utils/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/download')>()),
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

describe('XmlExportControl declaration and attributes', () => {
  function makeSchema(xXmlExport: Record<string, unknown>): JsonSchema {
    return {
      type: 'object',
      properties: {
        invoice_no: { type: 'string' },
        note: { type: 'string' },
        rush: { type: 'boolean' },
        lines: {
          type: 'array',
          items: { type: 'object', properties: { n: { type: 'number' }, sku: { type: 'string' } } },
        },
        invoiceExport: { type: 'object', 'x-xml-export': xXmlExport },
      },
    } as unknown as JsonSchema
  }
  const ui = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/invoiceExport' }],
  } as UISchemaElement
  const seed = {
    invoice_no: 'A&B',
    note: 'Rush order',
    rush: true,
    lines: [
      { n: 1, sku: 'A-1' },
      { n: 2, sku: 'B-2' },
    ],
    invoiceExport: {},
  }

  async function download(xXmlExport: Record<string, unknown>): Promise<string> {
    renderForm(makeSchema(xXmlExport), seed, ui)
    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)
    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    return vi.mocked(downloadTextFile).mock.calls[0][0]
  }

  it.each([
    [{ encoding: 'ISO-8859-1' }, /declaration.encoding can only be "UTF-8"/],
    [{ version: '2.0' }, /declaration.version must be "1.0" or "1.1"/],
    [{ standalone: 'maybe' }, /declaration.standalone must be "yes" or "no"/],
    [{ standAlone: 'no' }, /declaration has an unknown key "standAlone"/],
    ['yes', /declaration must be an object/],
  ])('shows a config error for declaration %j', async (declaration, message) => {
    renderForm(makeSchema({ declaration, writeTo: [{ from: 'invoice_no', to: 'Id' }] }), seed, ui)

    await waitFor(() => expect(screen.getByText(message)).toBeTruthy())
    expect(downloadButton()).toBeNull()
  })

  it('shows a config error for an attribute segment that is not last, even inside a nested writeTo', async () => {
    renderForm(
      makeSchema({ writeTo: [{ from: 'lines', to: 'Lines.Line', writeTo: [{ from: 'n', to: 'Party.@_id.x' }] }] }),
      seed,
      ui,
    )

    await waitFor(() =>
      expect(screen.getByText(/writeTo "Party.@_id.x": "@_id" must be the last segment/)).toBeTruthy(),
    )
    expect(downloadButton()).toBeNull()
  })

  it('shows a config error for an entry that is not an object', async () => {
    renderForm(makeSchema({ writeTo: ['invoice_no'] }), seed, ui)

    await waitFor(() => expect(screen.getByText(/every writeTo entry must be an object/)).toBeTruthy())
  })

  it('writes no declaration unless one is configured', async () => {
    const xml = await download({ rootElement: 'Invoice', writeTo: [{ from: 'invoice_no', to: 'Id' }] })
    expect(xml.startsWith('<Invoice>')).toBe(true)
  })

  it('writes the default declaration first for declaration: {}', async () => {
    const xml = await download({ rootElement: 'Invoice', declaration: {}, writeTo: [{ from: 'invoice_no', to: 'Id' }] })
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<Invoice>')).toBe(true)
  })

  it('writes the declared version and standalone', async () => {
    const xml = await download({
      rootElement: 'Invoice',
      declaration: { version: '1.1', standalone: 'no' },
      writeTo: [{ from: 'invoice_no', to: 'Id' }],
    })
    expect(xml.startsWith('<?xml version="1.1" encoding="UTF-8" standalone="no"?>')).toBe(true)
  })

  it('writes a top-level @_ entry as an attribute of the root element, escaped', async () => {
    const xml = await download({ rootElement: 'Invoice', writeTo: [{ from: 'invoice_no', to: '@_id' }] })
    expect(xml).toContain('<Invoice id="A&amp;B"')
  })

  it('writes attributes on each repeated element and text beside an attribute', async () => {
    const xml = await download({
      rootElement: 'Invoice',
      writeTo: [
        { from: 'note', to: 'Note.#text' },
        { formula: '"en"', to: 'Note.@_lang' },
        {
          from: 'lines',
          to: 'Lines.Line',
          writeTo: [
            { from: 'n', to: '@_n' },
            { from: 'sku', to: 'SKU' },
          ],
        },
      ],
    })
    expect(xml).toContain('<Note lang="en">Rush order</Note>')
    expect(xml).toContain('<Line n="1">')
    expect(xml).toContain('<Line n="2">')
    expect(xml).toContain('<SKU>B-2</SKU>')
  })

  it('writes a true attribute with its value, never as a bare flag', async () => {
    const xml = await download({ rootElement: 'Invoice', writeTo: [{ from: 'rush', to: '@_rush' }] })
    expect(xml).toContain('<Invoice rush="true"')
  })

  it('shows an error and downloads nothing when a value collides with a parent', async () => {
    renderForm(
      makeSchema({
        rootElement: 'Invoice',
        writeTo: [
          { from: 'note', to: 'Note' },
          { from: 'invoice_no', to: 'Note.@_ref' },
        ],
      }),
      seed,
      ui,
    )
    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(screen.getByText(/write its text to "Note.#text"/)).toBeTruthy())
    expect(downloadTextFile).not.toHaveBeenCalled()
  })

  it('shows the error when the download itself fails, instead of an unhandled rejection', async () => {
    vi.mocked(downloadTextFile).mockImplementationOnce(() => {
      throw new Error('Download blocked')
    })
    renderForm(makeSchema({ rootElement: 'Invoice', writeTo: [{ from: 'invoice_no', to: 'Id' }] }), seed, ui)
    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(screen.getByText('Download blocked')).toBeTruthy())
  })
})

describe('XmlExportControl dates and numbers', () => {
  const schema = {
    type: 'object',
    properties: {
      issued_on: { type: 'string', format: 'date' },
      total: { type: 'number' },
      lines: { type: 'array', items: { type: 'object', properties: { qty: { type: 'number' } } } },
      invoiceExport: {
        type: 'object',
        'x-xml-export': {
          rootElement: 'Invoice',
          writeTo: [
            { from: 'issued_on', to: 'IssueDate', as: 'date', format: 'M/D/YY' },
            { from: 'total', to: 'Total', as: 'number', decimals: 1 },
            { from: 'lines', to: 'Lines.Line', writeTo: [{ from: 'qty', to: 'Qty', as: 'number', decimals: 2 }] },
          ],
        },
      },
    },
  } as unknown as JsonSchema
  const ui = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/invoiceExport' }],
  } as UISchemaElement

  it('writes the form date in the XML format and numbers with fixed decimals', async () => {
    renderForm(schema, { issued_on: '2026-07-23', total: 8522, lines: [{ qty: 3 }], invoiceExport: {} }, ui)
    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(xml).toContain('<IssueDate>7/23/26</IssueDate>')
    expect(xml).toContain('<Total>8522.0</Total>')
    expect(xml).toContain('<Qty>3.00</Qty>')
  })

  it('shows a config error for decimals without as: number, even inside a nested writeTo', async () => {
    const bad = {
      type: 'object',
      properties: {
        lines: { type: 'array' },
        invoiceExport: {
          type: 'object',
          'x-xml-export': {
            writeTo: [{ from: 'lines', to: 'Lines.Line', writeTo: [{ from: 'qty', to: 'Qty', decimals: 1 }] }],
          },
        },
      },
    } as unknown as JsonSchema
    renderForm(bad, { lines: [{ qty: 3 }] }, ui)

    await waitFor(() => expect(screen.getByText(/writeTo "Qty": "decimals" needs "as": "number"/)).toBeTruthy())
    expect(downloadButton()).toBeNull()
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

describe('XmlExportControl fileName', () => {
  function makeSchema(fileName?: string): JsonSchema {
    return {
      type: 'object',
      properties: {
        invoice_no: { type: 'string' },
        invoiceExport: {
          type: 'object',
          'x-xml-export': { rootElement: 'Invoice', fileName, writeTo: [{ from: 'invoice_no', to: 'Id' }] },
        },
      },
    } as unknown as JsonSchema
  }
  const ui = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/invoiceExport' }],
  } as UISchemaElement

  async function downloadedName(fileName: string | undefined, data: Data): Promise<string> {
    renderForm(makeSchema(fileName), data, ui)
    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)
    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    return vi.mocked(downloadTextFile).mock.calls[0][1]
  }

  it('defaults to export.xml', async () => {
    expect(await downloadedName(undefined, { invoice_no: 'INV-7' })).toBe('export.xml')
  })

  it('fills the template from the form, sanitizing what a file name cannot hold', async () => {
    expect(await downloadedName('invoice_{invoice_no}.xml', { invoice_no: '121/2026' })).toBe('invoice_121_2026.xml')
  })

  it('falls back when the value the name depends on is empty', async () => {
    expect(await downloadedName('{invoice_no}.xml', { invoice_no: '', other: 'x' })).toBe('export.xml')
  })

  it('reads the template from the item under writeBase: parent', async () => {
    const schema = {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              exporter: {
                type: 'object',
                'x-xml-export': {
                  rootElement: 'Order',
                  writeBase: 'parent',
                  fileName: 'order-{id}.xml',
                  writeTo: [{ from: 'id', to: 'Id' }],
                },
              },
            },
          },
        },
      },
    } as unknown as JsonSchema
    const arrayUi = {
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
    renderForm(
      schema,
      {
        orders: [
          { id: '1', exporter: {} },
          { id: '2', exporter: {} },
        ],
      },
      arrayUi,
    )

    const buttons = await waitFor(() => {
      const found = screen.getAllByRole('button', { name: /Download XML/ })
      expect(found).toHaveLength(2)
      return found
    })
    fireEvent.click(buttons[1])
    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadTextFile).mock.calls[0][1]).toBe('order-2.xml')
  })
})
