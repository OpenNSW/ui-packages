import { fileExtension } from './file'
import { renderTemplate } from './template'

// Shared browser-download primitive: a Blob plus a synthetic anchor click,
// same mechanism any file-saving control in this package would otherwise
// reimplement. Kept separate from any one renderer so a second "download this
// as text" control (see XmlExportControl) never has to duplicate it.
export function downloadTextFile(content: string, fileName: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: mimeType }), fileName)
}

// Trigger a browser download from an already-fetched Blob under a chosen name.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

// Fetch a URL and save it under `fileName`. Throws on network failure or a
// non-OK response so the caller can surface an error.
export async function downloadFromUrl(url: string, fileName: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  downloadBlob(await response.blob(), fileName)
}

/**
 * Name used for a file row label and Download. With a template, render it
 * (same `{index}` / `{today(…)}` rules as export fileName) then append the
 * file's real extension from `name`, else `key`, unless already present.
 * Without a template, prefer the original `name`, else the storage `key`.
 */
export function downloadName(
  template: string | undefined,
  values: { index: number },
  file: { name?: string; key: string },
): string {
  const fallback = file.name || file.key
  if (!template) return fallback
  const rendered = renderFileName(template, values, fallback)
  const ext = fileExtension(file.name ?? '') ?? fileExtension(file.key)
  if (!ext) return rendered
  if (rendered.toLowerCase().endsWith(ext.toLowerCase())) return rendered
  return `${rendered}${ext}`
}

// Path separators, the characters Windows reserves, and control characters:
// what browsers themselves replace in a download's name.
const RESERVED = new Set(['/', '\\', '<', '>', ':', '"', '|', '?', '*'])
const unsafe = (ch: string) => RESERVED.has(ch) || ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f

// A name built from form values carries whatever the values do: `121/2026`
// would read as a folder. Nothing left, or only an extension (`{no}.xml` with
// no `no`), falls back rather than downloading as `.xml`.
export function sanitizeFileName(name: string, fallback: string): string {
  const cleaned = Array.from(name, (ch) => (unsafe(ch) ? '_' : ch))
    .join('')
    .trim()
  return cleaned === '' || cleaned.startsWith('.') ? fallback : cleaned
}

// An export button's `fileName`: a template rendered against the record the
// control reads, the same `{name}` / `{today(FORMAT)}` syntax x-computed.format
// uses, then made safe to save.
export function renderFileName(template: string, record: unknown, fallback: string): string {
  const values = record !== null && typeof record === 'object' && !Array.isArray(record) ? record : {}
  return sanitizeFileName(renderTemplate(template, values), fallback)
}
