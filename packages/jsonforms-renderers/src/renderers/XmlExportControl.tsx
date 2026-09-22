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
  /** Element name per entry — only used when the bound schema is `type: 'array'`. Default 'item'. */
  itemElement?: string
  /** Downloaded file's name. Default 'export.xml'. */
  fileName?: string
  /**
   * Assemble the exported document from elsewhere in the form instead of
   * serializing the scoped `data` verbatim — the mirror image of `x-xml`'s
   * own `writeTo`. Each entry's `from` is a form-data path (resolved from the
   * form root or this control's own record depending on `writeBase`) and
   * `to` is a dot-joined path into the document being built — see
   * utils/mapping.ts and docs/xml-export-control.md.
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
const DEFAULT_ITEM_ELEMENT = 'item'
const DEFAULT_FILE_NAME = 'export.xml'

// data is `unknown` from ControlProps, so this narrows "nothing worth
// exporting" the same way `hasValue` checks elsewhere in this package do:
// missing entirely, or a shape with nothing in it. A non-empty primitive at
// this scope shouldn't happen (the tester requires object/array), but is
// treated as exportable rather than silently disabled if it somehow arrives.
function isEmpty(data: unknown): boolean {
  if (data == null) return true
  if (Array.isArray(data)) return data.length === 0
  if (typeof data === 'object') return Object.keys(data).length === 0
  return false
}

// True when `data` is ALREADY shaped the way XMLBuilder wants its input —
// a single-key object whose one key is exactly `rootElement`. That's what
// XmlControl's own persisted value looks like: "the field's value IS the
// parsed document ... its own root element already names it" (see
// docs/xml-control.md). Wrapping a value like that AGAIN would double the
// root (`<salesData><salesData>...`), not re-export the document that was
// uploaded. A plain data object with no such key (the common case, e.g. an
// ordinary `{ customer, total }` field with no XmlControl involved) has no
// existing root to reuse, so it still gets wrapped below. Only relevant to
// the verbatim (no writeTo) path — a mapping always assembles a fresh object
// of its own shape, never one that coincidentally already IS the document.
function hasOwnRoot(data: unknown, rootElement: string): data is Record<string, unknown> {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return false
  const keys = Object.keys(data)
  return keys.length === 1 && keys[0] === rootElement
}

const XmlExportControl = ({ data, path, label, schema, visible = true }: XmlExportControlProps) => {
  const xXmlExport: XXmlExportOptions = schema?.['x-xml-export'] ?? {}
  const rootElement = xXmlExport.rootElement ?? DEFAULT_ROOT_ELEMENT
  const itemElement = xXmlExport.itemElement ?? DEFAULT_ITEM_ELEMENT
  const fileName = xXmlExport.fileName ?? DEFAULT_FILE_NAME
  const writeTo = xXmlExport.writeTo
  const writeBase = xXmlExport.writeBase ?? 'root'

  // Reading outside this control's own scope is the whole point of writeTo,
  // so it needs the raw tree rather than the scoped `data` prop — same
  // mechanism XmlControl's importer side and ComputedControl both use.
  const ctx = useJsonForms()
  const isMapper = writeTo !== undefined && writeTo.length > 0

  // `path` is this control's own field, so its parent is the record writeTo
  // reads relative to. At the form root that is '', which is exactly the
  // absolute behaviour — so 'parent' on a top-level control is a no-op, the
  // same as x-xml.writeBase.
  const base = writeBase === 'parent' ? path.split('.').slice(0, -1).join('.') : ''
  const baseData: unknown = isMapper ? (base ? Resolve.data(ctx.core?.data, base) : ctx.core?.data) : undefined

  const [error, setError] = useState<string | null>(null)

  // Without a mapping, disabled tracks the scoped field's own value, same as
  // before. With one, the scoped field may be unrelated to what's actually
  // being assembled, so this checks the data writeTo reads from instead — a
  // cheap, synchronous stand-in for "will there be anything to write" that
  // doesn't require resolving every entry (formula evaluation is async) just
  // to render a button.
  const disabled = isMapper ? isEmpty(baseData) : isEmpty(data)

  // Building XML from already-valid in-memory form data isn't a realistic
  // failure mode the way parsing untrusted uploaded content is (see
  // XmlControl) — UNLESS a mapping is configured, where a formula can still
  // fail against real data. resolveWrites is the only part of this that can
  // throw, so the try/catch stays scoped to it rather than wrapping the
  // whole handler.
  const handleDownload = useCallback(async () => {
    setError(null)
    let exportData: unknown = data
    if (isMapper && writeTo) {
      try {
        const writes = await resolveWrites(baseData, writeTo)
        exportData = buildFromWrites(writes)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'This mapping could not be resolved.')
        return
      }
    }

    const { XMLBuilder } = await import('fast-xml-parser')
    // XMLBuilder needs one top-level key as the root tag. A bare array has no
    // key of its own to repeat, so the array case always wraps each entry
    // under `itemElement` — an array NESTED inside an object needs no such
    // treatment, since XMLBuilder already repeats an array's own key as the
    // sibling tag per entry. A mapping (writeTo) always assembles a fresh
    // plain object (buildFromWrites), so neither the array/itemElement case
    // nor the hasOwnRoot unwrap applies to it — only to the verbatim,
    // no-mapping path.
    //
    // In the verbatim object case, `data` wraps under `rootElement` UNLESS it
    // already carries that as its sole key — exactly what a co-located
    // XmlControl's own value looks like (same scope, same field). Wrapping
    // that again would double the root instead of re-exporting the document
    // as uploaded; see hasOwnRoot above.
    const wrapped = isMapper
      ? { [rootElement]: exportData }
      : schema.type === 'array'
        ? { [rootElement]: { [itemElement]: exportData } }
        : hasOwnRoot(exportData, rootElement)
          ? exportData
          : { [rootElement]: exportData }

    const builder = new XMLBuilder({ format: true, indentBy: '  ', ignoreAttributes: true })
    const xml = builder.build(wrapped) as string
    downloadTextFile(xml, fileName, 'application/xml')
  }, [data, isMapper, writeTo, baseData, schema.type, rootElement, itemElement, fileName])

  if (visible === false) {
    return null
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
