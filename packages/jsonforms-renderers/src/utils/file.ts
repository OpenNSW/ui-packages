// Shared file-name / MIME helpers for upload accept matching and for deciding
// whether a file the user just chose can be previewed in a tab (View) vs only
// saved.

const VIEWABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'])

/** True when `file` matches a comma-separated accept list (wildcards, .ext, or MIME). */
export function matchesAccept(file: { name: string; type?: string }, accept: string): boolean {
  const acceptedTypes = accept
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return acceptedTypes.some((type) => {
    if (type === '*' || type === '*/*') return true
    if (type.endsWith('/*')) return (file.type ?? '').startsWith(type.slice(0, -1))
    if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type.toLowerCase())
    return file.type === type
  })
}

/**
 * Whether a file the user chose can be previewed in a tab: images a browser
 * shows, PDF and plain text. Not `image/*`: TIFF/HEIC are not displayable in
 * most browsers, and SVG runs script. Only the type the browser reports for the
 * file decides, because the preview is a blob URL made from that file, and the
 * browser serves it with exactly that type. A file with no reported type is
 * served with none, so the browser sniffs its bytes and may render HTML from
 * the page's own origin; its name says nothing about that. A saved file is not
 * judged here: the server says how it is served.
 */
export function isBrowserViewable(file: { type?: string }): boolean {
  return VIEWABLE_TYPES.has((file.type ?? '').toLowerCase())
}

/** `.xlsx` from `report.xlsx` or `0f8e….xlsx`; undefined when there is no extension. */
export function fileExtension(nameOrKey: string): string | undefined {
  const base = nameOrKey.split(/[/\\]/).pop() ?? nameOrKey
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return undefined
  return base.slice(dot)
}
