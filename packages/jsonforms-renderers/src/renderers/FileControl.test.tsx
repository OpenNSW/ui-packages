// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import { UploadProvider } from '../contexts/UploadContext'

// Exercises FileControl through a real JsonForms tree, the same way
// SpreadsheetControl.test.tsx does, because the behaviour under test is what
// this control writes back into the store, not its own rendered markup.

type Data = Record<string, unknown>

// jsdom doesn't implement these — FileControl calls them to preview an
// upload, incidental to the remove/clear behaviour this file tests.
beforeAll(() => {
  URL.createObjectURL = () => 'blob:mock'
  URL.revokeObjectURL = () => {}
})

const finishers: (() => void)[] = []

afterEach(() => {
  for (const stop of finishers) stop()
  finishers.length = 0
  cleanup()
})

const schema: JsonSchema = {
  type: 'object',
  properties: {
    attachment: { type: 'string', format: 'file' },
  },
}

const uischema = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/attachment' }],
} as UISchemaElement

function Harness({ seed, onData }: { seed: Data; onData: (data: Data) => void }) {
  const [initial] = useState(seed)
  // Theme for the same reason SpreadsheetControl's harness needs it (Radix
  // Tooltip/IconButton throw without a provider); UploadProvider supplies the
  // upload this control needs before there is a file to remove.
  return (
    <Theme>
      <UploadProvider onUpload={(file) => Promise.resolve({ key: file.name })}>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={initial}
          renderers={radixRenderers}
          onChange={({ data }) => onData(data as Data)}
        />
      </UploadProvider>
    </Theme>
  )
}

function renderForm(seed: Data) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })
  render(
    <Harness
      seed={seed}
      onData={(data) => {
        if (live) writes.push(data)
      }}
    />,
  )
  return { writes }
}

function uploadFile(name: string) {
  const input = document.querySelector('input[type=file]')
  if (!input) throw new Error('no file input')
  fireEvent.change(input, { target: { files: [new File(['contents'], name, { type: 'application/pdf' })] } })
}

describe('FileControl removing the last file', () => {
  it('removes the key entirely instead of leaving null behind', async () => {
    const { writes } = renderForm({})

    uploadFile('doc.pdf')
    await waitFor(() => expect(writes[writes.length - 1]?.attachment).toBe('doc.pdf'))

    // Single-file mode (default maxFiles: 1) hides the drop zone once
    // uploaded, so exactly two buttons remain: "View" and this remove icon.
    const buttons = [...document.querySelectorAll('button')]
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() => expect(writes[writes.length - 1]).toEqual({}))
    // The precise regression check: a value of `undefined` still leaves the
    // key present (as `null` used to), which `'attachment' in data` would not
    // catch on its own without this — toEqual({}) already proves it, this
    // spells out why.
    expect('attachment' in writes[writes.length - 1]).toBe(false)
  })
})
