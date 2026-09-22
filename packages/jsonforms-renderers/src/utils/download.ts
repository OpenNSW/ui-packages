// Shared browser-download primitive: a Blob plus a synthetic anchor click,
// same mechanism any file-saving control in this package would otherwise
// reimplement. Kept separate from any one renderer so a second "download this
// as text" control (see XmlExportControl) never has to duplicate it.
export function downloadTextFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
