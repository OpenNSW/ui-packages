import { useJsonForms, withJsonFormsControlProps } from '@jsonforms/react'
import { Resolve } from '@jsonforms/core'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Button, Text } from '@radix-ui/themes'
import { DownloadIcon } from '@radix-ui/react-icons'
import { useCallback, useState } from 'react'
import { downloadTextFile } from '../utils/download'
import { buildFromWrites, resolveWrites, type WriteToEntry } from '../utils/mapping'

interface XXmlExportOptions {
  /** Top-level wrapping element name. Default 'root'. */
  rootElement?: string
  /** Downloaded file's name. Default 'export.xml'. */
  fileName?: string
  /**
   * Assembles the exported document from elsewhere in the form — the mirror
   * image of `x-xml`'s own `writeTo`. Each entry's `from` is a form-data path
   * (resolved from the form root or this control's own record depending on
   * `writeBase`) and `to` is a dot-joined path into the document being built
   * — see utils/mapping.ts and docs/xml-export-control.md. Required: this
   * control never reads the scope it's bound to for its own sake, only to
   * host this config and place the button, so a missing/empty `writeTo`
   * leaves nothing to export.
   */
  writeTo?: WriteToEntry[]
  /**
   * Where `writeTo`'s `from` paths are resolved from. Default 'root' —
   * absolute from the form data root, the same default and the same
   * `'parent'` rebasing `x-xml.writeBase` gives an importer, for the same
   * reason: without it, an exporter sitting inside each array item would read
   * the same absolute paths for every item.
   */
  writeBase?: 'root' | 'parent'
}

type XmlExportControlProps = ControlProps & {
  schema: JsonSchema & { 'x-xml-export'?: XXmlExportOptions }
}

const DEFAULT_ROOT_ELEMENT = 'root'
const DEFAULT_FILE_NAME = 'export.xml'

// Same "config problem, not a runtime one" split SpreadsheetControl's own
// validateSpreadsheetConfig follows: a schema authoring mistake shows as an
// inline error box in place of the button, checked before anything else
// renders, rather than only surfacing when someone happens to click it.
function validateWriteTo(writeTo: WriteToEntry[] | undefined): string | null {
  if (writeTo === undefined) return 'writeTo is required — see docs/xml-export-control.md.'
  if (!Array.isArray(writeTo)) return 'writeTo must be an array of { from | formula, to } entries.'
  if (writeTo.length === 0) return 'writeTo is declared but empty — declare at least one entry.'
  return null
}

// `unknown` from ControlProps/Resolve.data, so this narrows "nothing worth
// exporting" the same way `hasValue` checks elsewhere in this package do:
// missing entirely, or a shape with nothing in it.
function isEmpty(data: unknown): boolean {
  if (data == null) return true
  if (Array.isArray(data)) return data.length === 0
  if (typeof data === 'object') return Object.keys(data).length === 0
  return false
}

const XmlExportControl = ({ path, label, schema, visible = true }: XmlExportControlProps) => {
  const xXmlExport: XXmlExportOptions = schema?.['x-xml-export'] ?? {}
  const rootElement = xXmlExport.rootElement ?? DEFAULT_ROOT_ELEMENT
  const fileName = xXmlExport.fileName ?? DEFAULT_FILE_NAME
  const writeTo = xXmlExport.writeTo
  const writeBase = xXmlExport.writeBase ?? 'root'
  const configError = validateWriteTo(writeTo)

  // Reading outside this control's own scope is the whole point of writeTo,
  // so it needs the raw tree rather than a scoped `data` prop — same
  // mechanism XmlControl's importer side and ComputedControl both use. This
  // control never reads its own scoped data at all.
  const ctx = useJsonForms()

  // `path` is this control's own field, so its parent is the record writeTo
  // reads relative to. At the form root that is '', which is exactly the
  // absolute behaviour — so 'parent' on a top-level control is a no-op, the
  // same as x-xml.writeBase.
  const base = writeBase === 'parent' ? path.split('.').slice(0, -1).join('.') : ''
  const baseData: unknown = base ? Resolve.data(ctx.core?.data, base) : ctx.core?.data

  const [error, setError] = useState<string | null>(null)

  // A cheap, synchronous stand-in for "will there be anything to write" that
  // doesn't require resolving every entry (formula evaluation is async) just
  // to render a button.
  const disabled = isEmpty(baseData)

  // Building XML from already-valid in-memory form data isn't a realistic
  // failure mode the way parsing untrusted uploaded content is (see
  // XmlControl) — UNLESS a formula fails against real data. resolveWrites is
  // the only part of this that can throw, so the try/catch stays scoped to
  // it rather than wrapping the whole handler.
  const handleDownload = useCallback(async () => {
    if (!writeTo) return
    setError(null)
    let exportData: unknown
    try {
      const writes = await resolveWrites(baseData, writeTo)
      exportData = buildFromWrites(writes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This mapping could not be resolved.')
      return
    }

    const { XMLBuilder } = await import('fast-xml-parser')
    // XMLBuilder needs one top-level key as the root tag. buildFromWrites
    // always assembles a fresh plain object, so wrapping is unconditional —
    // no array/hasOwnRoot special-casing needed, since this control never
    // touches the scope's own value.
    const wrapped = { [rootElement]: exportData }

    const builder = new XMLBuilder({ format: true, indentBy: '  ', ignoreAttributes: true })
    const xml = builder.build(wrapped) as string
    downloadTextFile(xml, fileName, 'application/xml')
  }, [writeTo, baseData, rootElement, fileName])

  if (visible === false) {
    return null
  }

  if (configError) {
    return (
      <Box mb="4">
        <Text as="label" size="2" weight="bold">
          {label}
        </Text>
        <Text size="2" color="red" style={{ display: 'block' }}>
          Invalid x-xml-export config: {configError}
        </Text>
      </Box>
    )
  }

  return (
    <Box mb="4">
      <Text as="label" size="2" weight="bold" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
        {label}
      </Text>
      <Button size="1" variant="soft" disabled={disabled} onClick={() => void handleDownload()}>
        <DownloadIcon />
        Download XML
      </Button>
      {error && (
        <Text size="2" color="red" style={{ display: 'block', marginTop: 'var(--space-2)' }}>
          {error}
        </Text>
      )}
    </Box>
  )
}

export default withJsonFormsControlProps(XmlExportControl)
