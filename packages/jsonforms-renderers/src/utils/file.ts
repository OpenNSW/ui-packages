// Shared file-name / MIME helpers for upload accept matching and for deciding
// whether a browser can display a file in a tab (View) vs only save it.

const VIEWABLE_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/html,text/plain,.png,.jpg,.jpeg,.gif,.webp,.pdf,.html,.htm,.txt'

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
 * Types a browser can usefully open in a tab. Not `image/*`: TIFF/HEIC are not
 * displayable in most browsers. No type and no extension stays viewable so View
 * remains available when nothing says what the file is. `extension` stands in
 * for a `name` that is not known.
 */
export function isBrowserViewable(file: { name?: string; extension?: string; type?: string }): boolean {
  const name = file.name ?? (file.extension ? `file${file.extension}` : '')
  const hasType = Boolean(file.type)
  const hasExt = fileExtension(name) !== undefined
  if (!hasType && !hasExt) return true
  return matchesAccept({ name, type: file.type }, VIEWABLE_ACCEPT)
}

/** `.xlsx` from `report.xlsx` or `0f8e….xlsx`; undefined when there is no extension. */
export function fileExtension(nameOrKey: string): string | undefined {
  const base = nameOrKey.split(/[/\\]/).pop() ?? nameOrKey
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return undefined
  return base.slice(dot)
}
