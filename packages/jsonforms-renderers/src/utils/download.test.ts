// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadBlob,
  downloadFromUrl,
  downloadName,
  downloadTextFile,
  renderFileName,
  sanitizeFileName,
} from './download'

// jsdom implements Blob but not URL.createObjectURL/revokeObjectURL at all, so
// what's verified here is the CONTRACT — a blob URL is created from the given
// content/type, an anchor is clicked with the right download name, and the URL
// is revoked afterwards — not an actual browser download. Stubbed as plain
// assignments (not vi.spyOn, which requires the property to already exist)
// and removed again afterwards rather than restored, for the same reason.
//
// downloadBlob defers revoke with setTimeout(0). Tests that trigger a download
// use fake timers so afterEach can flush that timeout before deleting stubs.

afterEach(() => {
  if (vi.isFakeTimers()) vi.runAllTimers()
  // @ts-expect-error -- jsdom doesn't declare these; see the stub note above.
  delete URL.createObjectURL
  // @ts-expect-error -- ditto.
  delete URL.revokeObjectURL
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('downloadTextFile', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('creates an object URL from the content and mime type given', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    downloadTextFile('<a>1</a>', 'a.xml', 'application/xml')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const [blob] = createObjectURL.mock.calls[0] as [Blob]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/xml')
  })

  it('clicks an anchor pointed at the object URL with the given file name', () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // Assert from inside the click so it sees the anchor's own attributes
      // rather than a detached element the caller mutated afterwards.
      expect(this.href).toBe('blob:mock-url')
      expect(this.download).toBe('export.xml')
    })

    downloadTextFile('<a>1</a>', 'export.xml', 'application/xml')

    expect(click).toHaveBeenCalledTimes(1)
  })

  it('revokes the object URL after triggering the download', () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURL = vi.fn()
    URL.revokeObjectURL = revokeObjectURL
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    downloadTextFile('<a>1</a>', 'a.xml', 'application/xml')

    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('clicks an anchor with the given download name for an existing blob', () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:from-blob')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:from-blob')
      expect(this.download).toBe('Attachment_1.xlsx')
    })

    downloadBlob(new Blob(['sheet'], { type: 'application/vnd.ms-excel' }), 'Attachment_1.xlsx')

    expect(click).toHaveBeenCalledTimes(1)
  })
})

describe('downloadFromUrl', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('downloads the response blob under the given name', async () => {
    const blob = new Blob(['sheet'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }))
    URL.createObjectURL = vi.fn().mockReturnValue('blob:from-url')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('Attachment_1.xlsx')
    })

    await downloadFromUrl('https://example.test/file', 'Attachment_1.xlsx')

    expect(fetch).toHaveBeenCalledWith('https://example.test/file')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    await expect(downloadFromUrl('https://example.test/file', 'a.xlsx')).rejects.toThrow(/403/)
  })

  it('throws on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(downloadFromUrl('https://example.test/file', 'a.xlsx')).rejects.toThrow('offline')
  })
})

describe('downloadName', () => {
  it('renders a template and appends the real extension', () => {
    expect(downloadName('Attachment_{index}', { index: 1 }, { name: 'report.xlsx' })).toBe('Attachment_1.xlsx')
  })

  it('does not double the extension when the template already ends with it', () => {
    expect(downloadName('Attachment_{index}.xlsx', { index: 2 }, { name: 'report.xlsx' })).toBe('Attachment_2.xlsx')
  })

  it('falls back to the original name when there is no template', () => {
    expect(downloadName(undefined, { index: 1 }, { name: 'report.xlsx' })).toBe('report.xlsx')
  })

  it('takes the extension a saved file reports when the original name is missing', () => {
    expect(downloadName('Attachment_{index}', { index: 1 }, { extension: '.xlsx' })).toBe('Attachment_1.xlsx')
  })

  it('names a saved file with no template Uploaded File plus its extension', () => {
    expect(downloadName(undefined, { index: 1 }, { extension: '.pdf' })).toBe('Uploaded File.pdf')
  })

  it('falls back to the original name when the template renders to nothing but an extension', () => {
    expect(downloadName('.pdf', { index: 1 }, { name: 'invoice.pdf' })).toBe('invoice.pdf')
    expect(downloadName(' ', { index: 1 }, { extension: '.pdf' })).toBe('Uploaded File.pdf')
  })

  it('drops an extension that is not a dot and letters or digits', () => {
    expect(downloadName('Attachment_{index}', { index: 1 }, { extension: '.pdf/../x' })).toBe('Attachment_1')
    expect(downloadName('Attachment_{index}', { index: 1 }, { extension: '.p:df' })).toBe('Attachment_1')
    expect(downloadName(undefined, { index: 1 }, { extension: 'pdf' })).toBe('Uploaded File')
  })

  it('adds no extension when none is known', () => {
    expect(downloadName('Attachment_{index}', { index: 1 }, {})).toBe('Attachment_1')
    expect(downloadName(undefined, { index: 1 }, {})).toBe('Uploaded File')
  })

  it('does not treat a long dotted suffix as an extension', () => {
    expect(downloadName('DC BAGS DETAILS _{index}.xlsx', { index: 1 }, { extension: '.not-an-extension-suffix' })).toBe(
      'DC BAGS DETAILS _1.xlsx',
    )
    expect(downloadName('DC BAGS DETAILS _{index}', { index: 1 }, { extension: '.not-an-extension-suffix' })).toBe(
      'DC BAGS DETAILS _1',
    )
  })

  it('keeps a real extension from the original name when another suffix is not one', () => {
    expect(
      downloadName('Attachment_{index}', { index: 3 }, { name: 'sheet.xls', extension: '.not-an-extension-suffix' }),
    ).toBe('Attachment_3.xls')
  })
})

describe('sanitizeFileName', () => {
  it('replaces path separators, so a value like 121/2026 is not read as a folder', () => {
    expect(sanitizeFileName('blend_121/2026.xml', 'export.xml')).toBe('blend_121_2026.xml')
    expect(sanitizeFileName('a\\b.xml', 'export.xml')).toBe('a_b.xml')
  })

  it('replaces the characters Windows reserves and control characters', () => {
    expect(sanitizeFileName('a<b>c:d"e|f?g*h.xml', 'export.xml')).toBe('a_b_c_d_e_f_g_h.xml')
    expect(sanitizeFileName('tab\there\u0000.xml', 'export.xml')).toBe('tab_here_.xml')
  })

  it('keeps ordinary names as they are, including spaces, unicode and braces', () => {
    expect(sanitizeFileName('Blend sheet – déjà {v2}.xml', 'export.xml')).toBe('Blend sheet – déjà {v2}.xml')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeFileName('  order-2.xml  ', 'export.xml')).toBe('order-2.xml')
  })

  it.each(['', '   ', '.xml'])('falls back for %j, which leaves no name to save under', (name) => {
    expect(sanitizeFileName(name, 'export.xml')).toBe('export.xml')
  })
})

describe('renderFileName', () => {
  it('fills placeholders from the record, then sanitizes', () => {
    expect(renderFileName('blend_{blend_no}.xml', { blend_no: '121/2026' }, 'export.xml')).toBe('blend_121_2026.xml')
  })

  it('falls back when the value a name depends on is empty', () => {
    expect(renderFileName('{no}.xml', { no: null }, 'export.xml')).toBe('export.xml')
  })

  it('treats a record that is not an object as having no values', () => {
    expect(renderFileName('order-{id}.xml', undefined, 'export.xml')).toBe('order-{id}.xml')
    expect(renderFileName('order-{id}.xml', ['x'], 'export.xml')).toBe('order-{id}.xml')
  })

  it('calls template functions such as today()', () => {
    expect(renderFileName('export-{today(YYYY)}.xml', {}, 'export.xml')).toMatch(/^export-\d{4}\.xml$/)
  })
})
