// Shared display-formatting helpers used by the file-upload-shaped controls
// (FileControl, SpreadsheetControl) to render their "<size> max · <types>"
// hint text and error messages.

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function formatAccept(accept: string): string {
  const entries = accept
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  // An `accept` list usually names the same format twice — once as an
  // extension and once as a MIME type — because browsers honour both and
  // authors list both to be safe. Spelling each one out produced hints like
  // "XML, XML, XML" and a 60-character VND.OPENXMLFORMATS-… for a plain .xlsx.
  //
  // Extensions are what a person recognises, so when any are present they are
  // the whole answer and the MIME types they duplicate are dropped. A list of
  // MIME types alone (image/*, application/pdf) still reads from those.
  const extensions = entries.filter((t) => t.startsWith('.'))
  const shown = extensions.length > 0 ? extensions : entries

  const labels = shown.map((t) => {
    // Wildcards like image/*
    if (t.endsWith('/*')) return t.split('/')[0].toUpperCase() + 'S'

    // Extensions like .pdf or .xlsx
    if (t.startsWith('.')) return t.slice(1).toUpperCase()

    // MIME types like application/pdf
    const subtype = t.split('/')[1]
    return subtype ? subtype.toUpperCase() : t
  })

  // Two spellings can still collapse to one label (text/csv and a bare csv),
  // so dedupe after mapping rather than before, keeping first-seen order.
  return [...new Set(labels)].join(', ')
}
