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
    expect(isBrowserViewable({ name: 'a', type: 'image/png' })).toBe(true)
    expect(isBrowserViewable({ name: 'a', type: 'application/pdf' })).toBe(true)
    expect(isBrowserViewable({ name: 'a', type: 'text/plain' })).toBe(true)
    expect(isBrowserViewable({ name: 'a', type: 'IMAGE/PNG' })).toBe(true)
  })

  it('allows listed extensions when the browser reports no type', () => {
    expect(isBrowserViewable({ name: 'photo.png' })).toBe(true)
    expect(isBrowserViewable({ name: 'doc.PDF' })).toBe(true)
  })

  it('rejects xlsx, TIFF, SVG, HTML and XML', () => {
    expect(isBrowserViewable({ name: 'sheet.xlsx' })).toBe(false)
    expect(isBrowserViewable({ name: 'a', type: 'image/tiff' })).toBe(false)
    expect(isBrowserViewable({ name: 'a.svg', type: 'image/svg+xml' })).toBe(false)
    expect(isBrowserViewable({ name: 'a.html', type: 'text/html' })).toBe(false)
    expect(isBrowserViewable({ name: 'a.html' })).toBe(false)
    expect(isBrowserViewable({ name: 'a.xml', type: 'text/xml' })).toBe(false)
  })

  it('lets the reported type decide over the extension', () => {
    expect(isBrowserViewable({ name: 'report.pdf', type: 'text/xml' })).toBe(false)
    expect(isBrowserViewable({ name: 'photo.png', type: 'text/html' })).toBe(false)
    expect(isBrowserViewable({ name: 'scan', type: 'application/pdf' })).toBe(true)
  })

  it('does not treat a file of no known type or extension as viewable', () => {
    expect(isBrowserViewable({ name: '0f8e7c1a' })).toBe(false)
    expect(isBrowserViewable({ name: '' })).toBe(false)
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
