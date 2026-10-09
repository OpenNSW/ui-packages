// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
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

const namedSchema = {
  type: 'object',
  properties: {
    attachment: {
      type: 'string',
      format: 'file',
      'x-file': { fileName: 'Attachment_{index}', accept: 'image/*,application/pdf,.xlsx,.html' },
    },
  },
} as unknown as JsonSchema

const multiSchema = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: { type: 'string', format: 'file' },
      'x-file': {
        maxFiles: 5,
        fileName: 'Attachment_{index}',
        accept: 'image/png,application/pdf,text/html,.xlsx,.png,.pdf,.html',
      },
    },
  },
} as unknown as JsonSchema

const multiUi = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/files' }],
} as UISchemaElement

function Harness({
  seed,
  onData,
  schema: formSchema = schema,
  uischema: formUi = uischema,
  enabled = true,
  getDownloadUrl,
}: {
  seed: Data
  onData: (data: Data) => void
  schema?: JsonSchema
  uischema?: UISchemaElement
  enabled?: boolean
  getDownloadUrl?: (key: string) => Promise<{ url: string; expiresAt: number }>
}) {
  const [initial] = useState(seed)
  // Theme for the same reason SpreadsheetControl's harness needs it (Radix
  // Tooltip/IconButton throw without a provider); UploadProvider supplies the
  // upload this control needs before there is a file to remove.
  return (
    <Theme>
      <UploadProvider
        onUpload={(file) => Promise.resolve({ key: file.name, name: file.name })}
        getDownloadUrl={getDownloadUrl}
      >
        <JsonForms
          schema={formSchema}
          uischema={formUi}
          data={initial}
          renderers={radixRenderers}
          onChange={({ data }) => onData(data as Data)}
          config={{ restrict: !enabled }}
          readonly={!enabled}
        />
      </UploadProvider>
    </Theme>
  )
}

function renderForm(
  seed: Data,
  options: {
    schema?: JsonSchema
    uischema?: UISchemaElement
    enabled?: boolean
    getDownloadUrl?: (key: string) => Promise<{ url: string; expiresAt: number }>
  } = {},
) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })
  render(
    <Harness
      seed={seed}
      schema={options.schema}
      uischema={options.uischema}
      enabled={options.enabled}
      getDownloadUrl={options.getDownloadUrl}
      onData={(data) => {
        if (live) writes.push(data)
      }}
    />,
  )
  return { writes }
}

function uploadFile(name: string, type: string) {
  const input = document.querySelector('input[type=file]')
  if (!input) throw new Error('no file input')
  fireEvent.change(input, { target: { files: [new File(['contents'], name, { type })] } })
}

describe('FileControl removing the last file', () => {
  it('removes the key entirely instead of leaving null behind', async () => {
    const { writes } = renderForm({})

    uploadFile('doc.pdf', 'application/pdf')
    await waitFor(() => expect(writes[writes.length - 1]?.attachment).toBe('doc.pdf'))

    // Single-file mode (default maxFiles: 1) hides the drop zone once
    // uploaded, so the last control button is the remove icon.
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

describe('FileControl View and Download', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['sheet'])),
      }),
    )
  })

  it('hides View for xlsx and shows it for png, pdf and html keys', () => {
    renderForm({ files: ['a.xlsx', 'b.png', 'c.pdf', 'd.html'] }, { schema: multiSchema, uischema: multiUi })

    const viewButtons = screen.queryAllByRole('button', { name: 'View' })
    expect(viewButtons).toHaveLength(3)
    expect(screen.getByText('Attachment_1.xlsx')).toBeTruthy()
    expect(screen.getByText('Attachment_2.png')).toBeTruthy()
    expect(screen.getByText('Attachment_3.pdf')).toBeTruthy()
    expect(screen.getByText('Attachment_4.html')).toBeTruthy()
  })

  it('downloads through the local blob under the template name with the real extension', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderForm({}, { schema: namedSchema })

    uploadFile('report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    await waitFor(() => expect(screen.getByText('Attachment_1.xlsx')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('blob:mock')
      expect(click).toHaveBeenCalled()
    })
    const anchors = click.mock.instances as unknown as HTMLAnchorElement[]
    expect(anchors.some((a) => a.download === 'Attachment_1.xlsx')).toBe(true)
  })

  it('downloads through getDownloadUrl for a saved form', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const getDownloadUrl = vi.fn().mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: Date.now() + 60_000,
    })
    renderForm({ attachment: '0f8e.xlsx' }, { schema: namedSchema, getDownloadUrl })

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => {
      expect(getDownloadUrl).toHaveBeenCalledWith('0f8e.xlsx')
      expect(fetch).toHaveBeenCalledWith('https://storage.example/signed')
      expect(click).toHaveBeenCalled()
    })
    const anchors = click.mock.instances as unknown as HTMLAnchorElement[]
    expect(anchors.some((a) => a.download === 'Attachment_1.xlsx')).toBe(true)
  })

  it('falls back to the original name when there is no template', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderForm({})

    uploadFile('report.pdf', 'application/pdf')
    await waitFor(() => expect(screen.getByText('report.pdf')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    const anchors = click.mock.instances as unknown as HTMLAnchorElement[]
    expect(anchors.some((a) => a.download === 'report.pdf')).toBe(true)
  })

  it('shows a row error for a failed Download when read-only', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    const getDownloadUrl = vi.fn().mockResolvedValue({
      url: 'https://storage.example/signed',
      expiresAt: Date.now() + 60_000,
    })
    renderForm({ attachment: 'doc.pdf' }, { schema: namedSchema, enabled: false, getDownloadUrl })

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => expect(screen.getByText('Unable to download file.')).toBeTruthy())
  })

  it('shows a row error for a failed Download when the single file slot is full', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    renderForm({}, { schema: namedSchema })

    uploadFile('doc.pdf', 'application/pdf')
    await waitFor(() => expect(screen.getByText('Attachment_1.pdf')).toBeTruthy())
    expect(document.querySelector('input[type=file]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => expect(screen.getByText('Unable to download file.')).toBeTruthy())
  })

  it('still opens View with window.open', async () => {
    const opened = { focus: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(opened as unknown as Window)

    renderForm({}, { schema: namedSchema })
    uploadFile('photo.png', 'image/png')
    await waitFor(() => expect(screen.getByRole('button', { name: 'View' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    expect(open).toHaveBeenCalledWith('blob:mock', '_blank', 'noopener,noreferrer')
  })
})
