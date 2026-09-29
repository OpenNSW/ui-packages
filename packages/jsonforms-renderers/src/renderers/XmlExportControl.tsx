import { useJsonForms, withJsonFormsControlProps } from '@jsonforms/react'
import { Resolve } from '@jsonforms/core'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Button, Text } from '@radix-ui/themes'
import { DownloadIcon } from '@radix-ui/react-icons'
import { useCallback, useState } from 'react'
import type { XmlBuilderOptions } from 'fast-xml-parser'
import { downloadTextFile } from '../utils/download'
import { buildFromWrites, resolveWrites, validateWriteToEntry, type WriteToEntry } from '../utils/mapping'

interface XmlDeclaration {
  /** Default '1.0'. */
  version?: '1.0' | '1.1'
  /** The file is always written as UTF-8, so that is the only value a declaration can honestly state. */
  encoding?: 'UTF-8'
  /** Omitted from the declaration unless set. */
  standalone?: 'yes' | 'no'
}

interface XXmlExportOptions {
  /** Top-level wrapping element name. Default 'root'. */
  rootElement?: string
  /** When set, the file starts with `<?xml version=".." encoding="UTF-8" …?>`. Absent — the default — writes none. */
  declaration?: XmlDeclaration
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

// The attribute prefix and text key are the ones src/utils/xml/parse.ts reads
// with, so what the importer reads the exporter writes back the same way.
// suppressBooleanAttributes is on by default and writes `true` as a bare
// `flag`, which isn't well-formed XML (the importer's own validator rejects
// it), so it's turned off.
const BUILDER_OPTIONS: XmlBuilderOptions = {
  format: true,
  indentBy: '  ',
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  suppressBooleanAttributes: false,
  processEntities: true,
}

function validateDeclaration(declaration: unknown): string | null {
  if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration)) {
    return 'declaration must be an object, e.g. { "standalone": "no" }, or {} for the defaults.'
  }
  const { version, encoding, standalone, ...unknownKeys } = declaration as Record<string, unknown>
  const [unknownKey] = Object.keys(unknownKeys)
  if (unknownKey) return `declaration has an unknown key "${unknownKey}" — only version, encoding and standalone.`
  if (version !== undefined && version !== '1.0' && version !== '1.1')
    return 'declaration.version must be "1.0" or "1.1".'
  if (encoding !== undefined && encoding !== 'UTF-8') {
    return 'declaration.encoding can only be "UTF-8" — the file is always written as UTF-8.'
  }
  if (standalone !== undefined && standalone !== 'yes' && standalone !== 'no') {
    return 'declaration.standalone must be "yes" or "no".'
  }
  return null
}

function validateEntries(entries: unknown[]): string | null {
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry))
      return 'every writeTo entry must be an object.'
    const { to, writeTo } = entry as WriteToEntry
    const problem = validateWriteToEntry(entry as WriteToEntry, 'export')
    if (problem) return `writeTo "${to}": ${problem}`
    if (writeTo !== undefined) {
      if (!Array.isArray(writeTo)) return `writeTo "${to}": its nested writeTo must be an array.`
      const nested = validateEntries(writeTo)
      if (nested) return nested
    }
  }
  return null
}

// Same "config problem, not a runtime one" split SpreadsheetControl's own
// validateSpreadsheetConfig follows: a schema authoring mistake shows as an
// inline error box in place of the button, checked before anything else
// renders, rather than only surfacing when someone happens to click it.
function validateConfig({ writeTo, declaration }: XXmlExportOptions): string | null {
  if (writeTo === undefined) return 'writeTo is required — see docs/xml-export-control.md.'
  if (!Array.isArray(writeTo)) return 'writeTo must be an array of { from | formula, to } entries.'
  if (writeTo.length === 0) return 'writeTo is declared but empty — declare at least one entry.'
  return validateEntries(writeTo) ?? (declaration === undefined ? null : validateDeclaration(declaration))
}

// XMLBuilder writes a `?xml` key as the declaration; it has to be the first key.
function declarationNode({ version = '1.0', standalone }: XmlDeclaration) {
  return { '@_version': version, '@_encoding': 'UTF-8', ...(standalone && { '@_standalone': standalone }) }
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
  const declaration = xXmlExport.declaration
  const configError = validateConfig(xXmlExport)

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

  // Everything from resolving to downloading sits in one try. Real data can
  // still fail an entry the config check can't see (a formula error, a value
  // written where another entry already nests, a Date under an attribute), and
  // anything that throws shows next to the button instead of becoming an
  // unhandled rejection with nothing downloaded and nothing said.
  const handleDownload = useCallback(async () => {
    if (!writeTo) return
    setError(null)
    try {
      const exportData = buildFromWrites(await resolveWrites(baseData, writeTo, 'export'))
      const { XMLBuilder } = await import('fast-xml-parser')
      // XMLBuilder needs one top-level key as the root tag. buildFromWrites
      // always assembles a fresh plain object, so wrapping is unconditional —
      // no array/hasOwnRoot special-casing needed, since this control never
      // touches the scope's own value. A top-level `@_` key in exportData is
      // therefore an attribute of the root element.
      const xmlDocument = {
        ...(declaration && { '?xml': declarationNode(declaration) }),
        [rootElement]: exportData,
      }
      const xml = new XMLBuilder(BUILDER_OPTIONS).build(xmlDocument) as string
      downloadTextFile(xml, fileName, 'application/xml')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This export could not be built.')
    }
  }, [writeTo, baseData, declaration, rootElement, fileName])

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
