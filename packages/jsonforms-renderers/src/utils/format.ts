// Shared display-formatting helpers used by the file-upload-shaped controls
// (FileControl, SpreadsheetControl) to render their "<size> max · <types>"
// hint text and error messages.

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function formatAccept(accept: string): string {
  return accept
    .split(',')
    .map((t) => {
      t = t.trim()

      // Handle wildcard types like image/*
      if (t.endsWith('/*')) {
        return t.split('/')[0].toUpperCase() + 'S'
      }

      // Handle extensions like .pdf or .xlsx
      if (t.startsWith('.')) {
        return t.slice(1).toUpperCase()
      }

      // Handle MIME types like application/pdf or application/vnd.ms-excel
      const subtype = t.split('/')[1]
      return subtype ? subtype.toUpperCase() : t
    })
    .join(', ')
}
