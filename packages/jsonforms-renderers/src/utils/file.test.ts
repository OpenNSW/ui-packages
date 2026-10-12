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
    expect(isBrowserViewable({ name: 'a', type: 'text/html' })).toBe(true)
  })

  it('allows listed extensions on a storage key', () => {
    expect(isBrowserViewable({ name: '0f8e7c1a-….png' })).toBe(true)
    expect(isBrowserViewable({ name: 'doc.pdf' })).toBe(true)
  })

  it('rejects xlsx and TIFF', () => {
    expect(isBrowserViewable({ name: 'sheet.xlsx' })).toBe(false)
    expect(isBrowserViewable({ name: 'a', type: 'image/tiff' })).toBe(false)
  })

  it('treats no type and no extension as viewable', () => {
    expect(isBrowserViewable({ name: '0f8e7c1a' })).toBe(true)
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
