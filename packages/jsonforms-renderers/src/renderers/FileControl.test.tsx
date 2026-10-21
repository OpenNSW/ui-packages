// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import { UploadProvider, type GetDownloadUrl } from '../contexts/UploadContext'

// Exercises FileControl through a real JsonForms tree, the same way
// SpreadsheetControl.test.tsx does, because the behaviour under test is what
// this control writes back into the store, not its own rendered markup.

type Data = Record<string, unknown>

// jsdom doesn't implement these — FileControl calls them to preview an
// upload, incidental to the remove/clear behaviour this file tests.
// Radix's menu and dialogs measure themselves with ResizeObserver, which jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

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

// A saved form holds opaque file references, not storage keys: a backend that
// issues them seals the key in a token like this one, dots included. Nothing
// about the file can be read from it.
const ref = (id: string) => `eyJhbGciOiJkaXIifQ..${id}.c2VhbGVk.dGFn`

// getDownloadUrl answering for each reference with the extension given.
function savedFiles(extensions: Record<string, string | undefined>) {
  return vi.fn((key: string) =>
    Promise.resolve({ url: `https://storage.example/${key}`, expiresAt: 0, extension: extensions[key] }),
  )
}

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
  getDownloadUrl?: GetDownloadUrl
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
    getDownloadUrl?: GetDownloadUrl
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

// Remove sits in the row's "More actions" menu and asks first.
function removeFile(name: string, confirm = true) {
  fireEvent.keyDown(screen.getByRole('button', { name: `More actions for ${name}` }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
  fireEvent.click(screen.getByRole('button', { name: confirm ? 'Remove file' : 'Keep file' }))
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

    removeFile('doc.pdf')

    await waitFor(() => expect(writes[writes.length - 1]).toEqual({}))
    // The precise regression check: a value of `undefined` still leaves the
    // key present (as `null` used to), which `'attachment' in data` would not
    // catch on its own without this — toEqual({}) already proves it, this
    // spells out why.
    expect('attachment' in writes[writes.length - 1]).toBe(false)
  })
})

describe('FileControl remove', () => {
  it('keeps the file when the trader chooses Keep file, and says so after a removal', async () => {
    const { writes } = renderForm({})
    uploadFile('doc.pdf', 'application/pdf')
    await waitFor(() => expect(writes[writes.length - 1]?.attachment).toBe('doc.pdf'))

    removeFile('doc.pdf', false)
    expect(writes[writes.length - 1]?.attachment).toBe('doc.pdf')

    removeFile('doc.pdf')
    await waitFor(() => expect(writes[writes.length - 1]).toEqual({}))
    expect(screen.getByRole('status').textContent).toBe('doc.pdf removed.')
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

  it('hides View for an uploaded xlsx and shows it for an uploaded png', async () => {
    renderForm({}, { schema: multiSchema, uischema: multiUi })

    uploadFile('report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    await waitFor(() => expect(screen.getByText('Attachment_1.xlsx')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'View' })).toBeNull()

    uploadFile('photo.png', 'image/png')
    await waitFor(() => expect(screen.getByText('Attachment_2.png')).toBeTruthy())
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(1)
  })

  it('offers View for every saved file and asks getDownloadUrl about none of them until clicked', () => {
    const getDownloadUrl = savedFiles({ [ref('a')]: '.xlsx', [ref('b')]: '.png' })
    renderForm({ files: [ref('a'), ref('b')] }, { schema: multiSchema, uischema: multiUi, getDownloadUrl })

    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2)
    expect(screen.getByText('Attachment_1')).toBeTruthy()
    expect(screen.getByText('Attachment_2')).toBeTruthy()
    expect(getDownloadUrl).not.toHaveBeenCalled()
  })

  it('downloads a saved file View cannot show instead of opening it', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const opened = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(opened as unknown as Window)
    const getDownloadUrl = savedFiles({ [ref('a')]: '.xlsx' })
    renderForm({ attachment: ref('a') }, { schema: namedSchema, getDownloadUrl })

    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(opened.close).toHaveBeenCalled()
    expect(opened.location.href).toBe('')
    expect(getDownloadUrl).toHaveBeenCalledTimes(1)
    const anchors = click.mock.instances as unknown as HTMLAnchorElement[]
    expect(anchors.some((a) => a.download === 'Attachment_1.xlsx')).toBe(true)
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
    const getDownloadUrl = savedFiles({ [ref('a')]: '.xlsx' })
    renderForm({ attachment: ref('a') }, { schema: namedSchema, getDownloadUrl })

    // Clicked straight away: the name waits for getDownloadUrl's answer.
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(`https://storage.example/${ref('a')}`)
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

  it('names a saved file without a template Uploaded File plus its extension', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderForm({ attachment: ref('a') }, { getDownloadUrl: savedFiles({ [ref('a')]: '.pdf' }) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'View' })).toBeTruthy())
    expect(screen.getByText('Uploaded File')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    const anchors = click.mock.instances as unknown as HTMLAnchorElement[]
    expect(anchors.some((a) => a.download === 'Uploaded File.pdf')).toBe(true)
  })

  it('reads nothing from the reference when getDownloadUrl does not say what the file is', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderForm({ attachment: ref('a') }, { schema: namedSchema, getDownloadUrl: savedFiles({}) })

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => expect(click).toHaveBeenCalled())
    const anchors = click.mock.instances as unknown as HTMLAnchorElement[]
    expect(anchors.some((a) => a.download === 'Attachment_1')).toBe(true)
  })

  it('asks getDownloadUrl again on the next click after it fails', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const getDownloadUrl = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ url: 'https://storage.example/a', expiresAt: 0, extension: '.pdf' })
    renderForm({ attachment: ref('a') }, { schema: namedSchema, getDownloadUrl })

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(screen.getByText('Unable to download file.')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(getDownloadUrl).toHaveBeenCalledTimes(2)
    const anchors = click.mock.instances as unknown as HTMLAnchorElement[]
    expect(anchors.some((a) => a.download === 'Attachment_1.pdf')).toBe(true)
  })

  it('shows a row error when getDownloadUrl throws', async () => {
    const getDownloadUrl = vi.fn(() => {
      throw new Error('no token')
    })
    renderForm({ attachment: ref('a') }, { schema: namedSchema, getDownloadUrl })

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))

    await waitFor(() => expect(screen.getByText('Unable to download file.')).toBeTruthy())
  })

  it('shows a row error for a failed Download when read-only', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    const getDownloadUrl = savedFiles({ [ref('a')]: '.pdf' })
    renderForm({ attachment: ref('a') }, { schema: namedSchema, enabled: false, getDownloadUrl })

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

  it('opens View through getDownloadUrl for a saved form', async () => {
    const opened = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(opened as unknown as Window)
    const getDownloadUrl = savedFiles({ [ref('a')]: '.png' })
    renderForm({ attachment: ref('a') }, { schema: namedSchema, getDownloadUrl })
    await waitFor(() => expect(screen.getByRole('button', { name: 'View' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => expect(opened.location.href).toBe(`https://storage.example/${ref('a')}`))
    expect(open).toHaveBeenCalledWith('', '_blank')
  })

  it('shows a row error when View cannot resolve the link', async () => {
    const opened = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(opened as unknown as Window)
    const getDownloadUrl = vi.fn().mockResolvedValue(undefined)
    renderForm({ attachment: ref('a') }, { schema: namedSchema, getDownloadUrl })
    await waitFor(() => expect(screen.getByRole('button', { name: 'View' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    await waitFor(() => expect(screen.getByText('Unable to open file.')).toBeTruthy())
    expect(opened.close).toHaveBeenCalled()
  })
})
