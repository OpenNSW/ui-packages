// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

// Two layouts share this control: a plain parse-and-hold field keeps the drop
// zone it has always had, while configuring writeTo turns it into an action
// that fills OTHER fields and renders as a single button.

type Data = Record<string, unknown>

const finishers: (() => void)[] = []
afterEach(() => {
  for (const stop of finishers) stop()
  finishers.length = 0
  cleanup()
})

const uischema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/doc' },
    { type: 'Control', scope: '#/properties/code' },
  ],
} as UISchemaElement

function makeSchema(xXml: Record<string, unknown>): JsonSchema {
  return {
    type: 'object',
    properties: {
      doc: { type: 'object', title: 'Document', 'x-xml': xXml },
      code: { type: 'string', title: 'Code' },
    },
  } as unknown as JsonSchema
}

// The `data` prop is a SEED, never fed back from onChange — feeding it back
// makes JsonForms replace its internal state and drop writes made from effects
// and dispatch, which is exactly what this control does.
function renderForm(schema: JsonSchema, seed: Data = {}) {
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
          uischema={uischema}
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
  return { writes, latest: () => writes[writes.length - 1] }
}

const WRITE_TO = [{ from: 'order.code', to: 'code' }]
const xml = (code: string) => `<?xml version="1.0" encoding="UTF-8"?><order><code>${code}</code></order>`

const dropzone = () => screen.queryByText(/Click to upload or drag and drop/)
const uploadButton = () => screen.queryByRole('button', { name: /^Upload$/ })

function upload(code: string) {
  const input = document.querySelector('input[type=file]')
  if (!input) throw new Error('no file input')
  const file = new File([xml(code)], 'order.xml', { type: 'text/xml' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('XmlControl as an importer (writeTo configured)', () => {
  it('renders one button instead of the drop zone', async () => {
    renderForm(makeSchema({ writeTo: WRITE_TO, persistDocument: false }))

    await waitFor(() => expect(uploadButton()).toBeTruthy())
    expect(dropzone()).toBeNull()
  })

  it('looks the same whether or not it keeps the document', async () => {
    // persistDocument is about what gets STORED. What the control is FOR — and
    // so how it renders — is decided by writeTo alone.
    renderForm(makeSchema({ writeTo: WRITE_TO, persistDocument: true }))

    await waitFor(() => expect(uploadButton()).toBeTruthy())
    expect(dropzone()).toBeNull()
  })

  it('fills the target field, and a second upload overwrites it', async () => {
    const { latest } = renderForm(makeSchema({ writeTo: WRITE_TO, persistDocument: false }))
    await waitFor(() => expect(uploadButton()).toBeTruthy())

    upload('FIRST')
    await waitFor(() => expect(latest()?.code).toBe('FIRST'))

    upload('SECOND')
    await waitFor(() => expect(latest()?.code).toBe('SECOND'))
  })

  it('offers no remove control, which could not undo what the import wrote', async () => {
    const { latest } = renderForm(makeSchema({ writeTo: WRITE_TO, persistDocument: true }))
    upload('FIRST')
    await waitFor(() => expect(latest()?.code).toBe('FIRST'))

    // Even holding a document, an importer shows neither remove nor "replace":
    // removing the document here would leave `code` filled, and the button is
    // still plain Upload.
    expect(screen.queryByLabelText('Remove document')).toBeNull()
    expect(screen.queryByLabelText('Replace document')).toBeNull()
    expect(uploadButton()).toBeTruthy()
  })

  it('does not store the document when persistDocument is false', async () => {
    const { latest } = renderForm(makeSchema({ writeTo: WRITE_TO, persistDocument: false }))
    upload('FIRST')
    await waitFor(() => expect(latest()?.code).toBe('FIRST'))

    expect(latest()?.doc).toBeUndefined()
  })
})

describe('XmlControl as a plain parse-and-hold field', () => {
  it('keeps the drop zone when no writeTo is configured', async () => {
    renderForm(makeSchema({}))

    await waitFor(() => expect(dropzone()).toBeTruthy())
    expect(uploadButton()).toBeNull()
  })

  it('stores the parsed document and offers replace and remove', async () => {
    const { latest } = renderForm(makeSchema({}))
    upload('FIRST')

    await waitFor(() => expect(latest()?.doc).toEqual({ order: { code: 'FIRST' } }))
    expect(screen.queryByLabelText('Remove document')).toBeTruthy()
    expect(screen.queryByLabelText('Replace document')).toBeTruthy()
  })
})
