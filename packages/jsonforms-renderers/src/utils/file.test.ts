import { describe, expect, it } from 'vitest'
import { fileExtension, isBrowserViewable, matchesAccept } from './file'

describe('matchesAccept', () => {
  it('matches a MIME wildcard', () => {
    expect(matchesAccept({ name: 'a.png', type: 'image/png' }, 'image/*')).toBe(true)
    expect(matchesAccept({ name: 'a.pdf', type: 'application/pdf' }, 'image/*')).toBe(false)
  })

  it('matches an extension entry', () => {
    expect(matchesAccept({ name: 'Report.XLSX' }, '.xlsx')).toBe(true)
    expect(matchesAccept({ name: 'report.pdf' }, '.xlsx')).toBe(false)
  })

  it('matches an exact MIME type', () => {
    expect(matchesAccept({ name: 'a', type: 'application/pdf' }, 'application/pdf')).toBe(true)
    expect(matchesAccept({ name: 'a', type: 'text/plain' }, 'application/pdf')).toBe(false)
  })

  it('matches * / */*', () => {
    expect(matchesAccept({ name: 'a.bin', type: 'application/octet-stream' }, '*')).toBe(true)
    expect(matchesAccept({ name: 'a.bin' }, '*/*')).toBe(true)
  })
})

describe('isBrowserViewable', () => {
  it('allows listed MIME types', () => {
    expect(isBrowserViewable({ type: 'image/png' })).toBe(true)
    expect(isBrowserViewable({ type: 'image/jpeg' })).toBe(true)
    expect(isBrowserViewable({ type: 'application/pdf' })).toBe(true)
    expect(isBrowserViewable({ type: 'text/plain' })).toBe(true)
    expect(isBrowserViewable({ type: 'IMAGE/PNG' })).toBe(true)
  })

  it('rejects xlsx, TIFF, SVG, HTML and XML', () => {
    expect(isBrowserViewable({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe(false)
    expect(isBrowserViewable({ type: 'image/tiff' })).toBe(false)
    expect(isBrowserViewable({ type: 'image/svg+xml' })).toBe(false)
    expect(isBrowserViewable({ type: 'text/html' })).toBe(false)
    expect(isBrowserViewable({ type: 'text/xml' })).toBe(false)
  })

  it('does not treat a file the browser reports no type for as viewable', () => {
    expect(isBrowserViewable({})).toBe(false)
    expect(isBrowserViewable({ type: undefined })).toBe(false)
    expect(isBrowserViewable({ type: '' })).toBe(false)
  })
})

describe('fileExtension', () => {
  it('returns the extension including the dot', () => {
    expect(fileExtension('report.xlsx')).toBe('.xlsx')
    expect(fileExtension('0f8e….PDF')).toBe('.PDF')
  })

  it('returns undefined when there is no extension', () => {
    expect(fileExtension('readme')).toBeUndefined()
    expect(fileExtension('.gitignore')).toBeUndefined()
    expect(fileExtension('ends-with-dot.')).toBeUndefined()
  })
})
