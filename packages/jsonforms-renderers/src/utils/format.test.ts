import { describe, expect, it } from 'vitest'
import { formatAccept, formatBytes } from './format'

describe('formatAccept', () => {
  it('names a format once when the list spells it several ways', () => {
    // XmlControl's default. Browsers honour extensions and MIME types alike, so
    // authors list both — which used to render as "XML, XML, XML".
    expect(formatAccept('.xml,text/xml,application/xml')).toBe('XML')
  })

  it('prefers extensions over the MIME types that duplicate them', () => {
    // SpreadsheetControl's default, which used to run to 60 characters of
    // VND.OPENXMLFORMATS-OFFICEDOCUMENT.SPREADSHEETML.SHEET.
    expect(
      formatAccept(
        '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv',
      ),
    ).toBe('XLSX, XLS, CSV')
  })

  it('still reads from MIME types when no extension is listed', () => {
    // FileControl's default — unchanged by the preference above.
    expect(formatAccept('image/*,application/pdf')).toBe('IMAGES, PDF')
  })

  it('keeps the order the author wrote', () => {
    expect(formatAccept('.csv,.xlsx')).toBe('CSV, XLSX')
  })

  it('dedupes after mapping, not before', () => {
    // Two different entries can collapse to the same label.
    expect(formatAccept('text/csv,application/csv')).toBe('CSV')
  })

  it('ignores blank entries from a trailing or doubled comma', () => {
    expect(formatAccept('.pdf, ,')).toBe('PDF')
  })

  it('falls back to the raw entry when there is no subtype to take', () => {
    expect(formatAccept('application')).toBe('application')
  })
})

describe('formatBytes', () => {
  it('scales to the largest unit that fits', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })
})
