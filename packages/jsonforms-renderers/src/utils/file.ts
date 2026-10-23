// Shared file-name / MIME helpers for upload accept matching and for deciding
// whether a file the user just chose can be previewed in a tab (View) vs only
// saved.

const VIEWABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'])
const VIEWABLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt'])

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
 * most browsers, and SVG runs script. The type the browser reports for the file
 * decides; the extension is read only when it reports none. A file whose type
 * and extension are both unknown is not viewable. A saved file is not judged
 * here: the server says how it is served.
 */
export function isBrowserViewable(file: { name: string; type?: string }): boolean {
  if (file.type) return VIEWABLE_TYPES.has(file.type.toLowerCase())
  const extension = fileExtension(file.name)
  return extension !== undefined && VIEWABLE_EXTENSIONS.has(extension.toLowerCase())
}

/** `.xlsx` from `report.xlsx` or `0f8e….xlsx`; undefined when there is no extension. */
export function fileExtension(nameOrKey: string): string | undefined {
  const base = nameOrKey.split(/[/\\]/).pop() ?? nameOrKey
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return undefined
  return base.slice(dot)
}
