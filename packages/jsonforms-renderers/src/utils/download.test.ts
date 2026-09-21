// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from './download'

// jsdom implements Blob but not URL.createObjectURL/revokeObjectURL at all, so
// what's verified here is the CONTRACT — a blob URL is created from the given
// content/type, an anchor is clicked with the right download name, and the URL
// is revoked afterwards — not an actual browser download. Stubbed as plain
// assignments (not vi.spyOn, which requires the property to already exist)
// and removed again afterwards rather than restored, for the same reason.

afterEach(() => {
  // @ts-expect-error -- jsdom doesn't declare these; see the stub note above.
  delete URL.createObjectURL
  // @ts-expect-error -- ditto.
  delete URL.revokeObjectURL
  vi.restoreAllMocks()
})

describe('downloadTextFile', () => {
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

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
