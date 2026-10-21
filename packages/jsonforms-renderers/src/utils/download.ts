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
// Revoke on the next turn so Safari/Firefox can start the download first;
// revoking synchronously after click() can cancel larger files.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// Fetch a URL and save it under `fileName`. Throws on network failure or a
// non-OK response so the caller can surface an error.
export async function downloadFromUrl(url: string, fileName: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status})`)
  downloadBlob(await response.blob(), fileName)
}

// What a file is called when nothing better is known: no template and no
// original name, as for a saved file.
export const UNNAMED_FILE = 'Uploaded File'

/**
 * Name used for a file row label and Download. With a template, render it
 * (same `{index}` / `{today(…)}` rules as export fileName) then append the
 * file's real extension, from its original `name` or else `extension`, unless
 * already present. Without a template, prefer the original `name`, else
 * `Uploaded File` plus the extension. A field's value is never read for a
 * name: it is an opaque reference to the file.
 */
export function downloadName(
  template: string | undefined,
  values: { index: number },
  file: { name?: string; extension?: string },
): string {
  if (!template && file.name) return file.name
  const base = template
    ? renderFileName(template, values, sanitizeFileName(file.name ?? '', UNNAMED_FILE))
    : UNNAMED_FILE
  const ext = safeExtension(fileExtension(file.name ?? '') ?? file.extension)
  if (!ext) return base
  if (base.toLowerCase().endsWith(ext.toLowerCase())) return base
  return `${base}${ext}`
}

// An extension is a dot and a short run of letters or digits (`.xlsx`). A
// longer suffix is an auth tag from a file token, not an extension. Anything
// else, such as one a backend took from an uploaded name (`.pdf/../x`), is
// dropped rather than appended to a name that was made safe.
function safeExtension(ext: string | undefined): string | undefined {
  return ext && /^\.[A-Za-z0-9]{1,5}$/.test(ext) ? ext : undefined
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
