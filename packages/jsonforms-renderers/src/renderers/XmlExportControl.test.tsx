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
// scope/options combination. There's no file input here, unlike
// XmlControl.test.tsx: this control only ever reads `data`, never writes it.

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

describe('XmlExportControl bound to an object scope', () => {
  function makeSchema(xXmlExport: Record<string, unknown> = {}): JsonSchema {
    return {
      type: 'object',
      properties: {
        doc: { type: 'object', title: 'Document', 'x-xml-export': xXmlExport },
      },
    } as unknown as JsonSchema
  }

  it('is disabled when the field has no data', async () => {
    renderForm(makeSchema(), {})

    await waitFor(() => expect(downloadButton()).toBeTruthy())
    expect(downloadButton()?.disabled).toBe(true)
  })

  it('is disabled when the field is an empty object', async () => {
    renderForm(makeSchema(), { doc: {} })

    await waitFor(() => expect(downloadButton()).toBeTruthy())
    expect(downloadButton()?.disabled).toBe(true)
  })

  it('builds XML wrapped under the default root element and downloads it', async () => {
    renderForm(makeSchema(), { doc: { customer: 'Acme', total: 1200 } })

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml, fileName, mimeType] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(xml).toContain('<root>')
    expect(xml).toContain('<customer>Acme</customer>')
    expect(xml).toContain('<total>1200</total>')
    expect(fileName).toBe('export.xml')
    expect(mimeType).toBe('application/xml')
  })

  it('respects rootElement and fileName options', async () => {
    renderForm(makeSchema({ rootElement: 'invoice', fileName: 'invoice.xml' }), {
      doc: { customer: 'Acme', total: 1200 },
    })

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml, fileName] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(xml).toContain('<invoice>')
    expect(fileName).toBe('invoice.xml')
  })

  it('renders nothing when visible is false', async () => {
    const schema = {
      type: 'object',
      properties: {
        doc: { type: 'object', title: 'Document', 'x-xml-export': {} },
        hide: { type: 'boolean' },
      },
    } as unknown as JsonSchema
    const hiddenUischema = {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/doc',
          rule: { effect: 'HIDE', condition: { scope: '#/properties/hide', schema: { const: true } } },
        },
      ],
    } as UISchemaElement
    renderForm(schema, { doc: { a: 1 }, hide: true }, hiddenUischema)

    await new Promise((r) => setTimeout(r, 20))
    expect(downloadButton()).toBeNull()
  })
})

describe('XmlExportControl bound to an array scope', () => {
  function makeArraySchema(xXmlExport: Record<string, unknown> = {}): JsonSchema {
    return {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' }, qty: { type: 'number' } } },
          'x-xml-export': xXmlExport,
        },
      },
    } as unknown as JsonSchema
  }
  const arrayUischema = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/orders' }],
  } as UISchemaElement

  it('is disabled when the array is empty', async () => {
    renderForm(makeArraySchema(), { orders: [] }, arrayUischema)

    await waitFor(() => expect(downloadButton()).toBeTruthy())
    expect(downloadButton()?.disabled).toBe(true)
  })

  it('wraps each entry under itemElement inside rootElement', async () => {
    renderForm(
      makeArraySchema({ rootElement: 'orders', itemElement: 'order' }),
      {
        orders: [
          { id: '1', qty: 2 },
          { id: '2', qty: 5 },
        ],
      },
      arrayUischema,
    )

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(xml).toContain('<orders>')
    expect((xml.match(/<order>/g) ?? []).length).toBe(2)
    expect(xml).toContain('<id>1</id>')
    expect(xml).toContain('<qty>5</qty>')
  })
})

// Two elements at the SAME scope, both schema-only testers at rank 10, would
// otherwise tie and always render whichever renderer is registered first —
// see XmlControlTester's own comment. `options: { export: true }` is the
// documented way to place this button beside the upload control it re-exports.
describe('XmlControl and XmlExportControl co-located at the same scope', () => {
  function makeSchema(): JsonSchema {
    return {
      type: 'object',
      properties: {
        sales_data: {
          type: 'object',
          title: 'Sales Data',
          'x-xml': {},
          'x-xml-export': { rootElement: 'salesData' },
        },
      },
    } as unknown as JsonSchema
  }
  const coLocatedUischema = {
    type: 'VerticalLayout',
    elements: [
      { type: 'Control', scope: '#/properties/sales_data' },
      { type: 'Control', scope: '#/properties/sales_data', options: { export: true } },
    ],
  } as UISchemaElement

  it('renders XmlControl for the plain element and XmlExportControl for the export-marked one', async () => {
    renderForm(makeSchema(), { sales_data: { customer: 'Acme' } }, coLocatedUischema)

    // XmlControl's own upload affordances (replace/remove) are present once
    // there's a value — proof the FIRST element rendered the upload control,
    // not the export button, despite sharing a rank-10 schema-only tie.
    await waitFor(() => expect(screen.queryByLabelText('Remove document')).toBeTruthy())
    expect(downloadButton()).toBeTruthy()
  })

  // The value above (`{ customer: 'Acme' }`) never had a `salesData` key to
  // begin with, so it can't catch a double-wrap — the bug only shows up when
  // `data` is ALREADY shaped the way XmlControl itself persists it. See
  // hasOwnRoot in XmlExportControl.tsx.
  it('re-exports a co-located XmlControl value with ONE root, not a nested one', async () => {
    renderForm(
      makeSchema(),
      // Exactly what XmlControl's own docs say its persisted value looks
      // like: "the field's value IS the parsed document ... keyed by its own
      // root element name" — no wrapper of ours to add on top of that.
      { sales_data: { salesData: { sale: [{ Item: 'Widget A', Quantity: 500 }] } } },
      coLocatedUischema,
    )

    await waitFor(() => expect(downloadButton()?.disabled).toBe(false))
    fireEvent.click(downloadButton()!)

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalledTimes(1))
    const [xml] = vi.mocked(downloadTextFile).mock.calls[0]
    // Exactly one <salesData>, not <salesData><salesData>.
    expect((xml.match(/<salesData>/g) ?? []).length).toBe(1)
    expect(xml).toContain('<Item>Widget A</Item>')
    expect(xml).toContain('<Quantity>500</Quantity>')
  })
})
