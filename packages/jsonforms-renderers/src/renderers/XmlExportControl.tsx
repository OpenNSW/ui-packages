import { withJsonFormsControlProps } from '@jsonforms/react'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Button, Text } from '@radix-ui/themes'
import { DownloadIcon } from '@radix-ui/react-icons'
import { useCallback } from 'react'
import { downloadTextFile } from '../utils/download'

interface XXmlExportOptions {
  /** Top-level wrapping element name. Default 'root'. */
  rootElement?: string
  /** Element name per entry — only used when the bound schema is `type: 'array'`. Default 'item'. */
  itemElement?: string
  /** Downloaded file's name. Default 'export.xml'. */
  fileName?: string
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

const XmlExportControl = ({ data, label, schema, visible = true }: XmlExportControlProps) => {
  const xXmlExport: XXmlExportOptions = schema?.['x-xml-export'] ?? {}
  const rootElement = xXmlExport.rootElement ?? DEFAULT_ROOT_ELEMENT
  const itemElement = xXmlExport.itemElement ?? DEFAULT_ITEM_ELEMENT
  const fileName = xXmlExport.fileName ?? DEFAULT_FILE_NAME

  const disabled = isEmpty(data)

  // Building XML from already-valid in-memory form data isn't a realistic
  // failure mode the way parsing untrusted uploaded content is (see
  // XmlControl), so there's no error/status state machine here — just the
  // lazy import + build, same on-demand pattern utils/xml/parse.ts uses for
  // XMLParser (never imported at module top level).
  const handleDownload = useCallback(async () => {
    const { XMLBuilder } = await import('fast-xml-parser')
    // XMLBuilder needs one top-level key as the root tag, so `data` is
    // wrapped before building. A bare array has no key of its own to repeat,
    // so the array case additionally wraps each entry under `itemElement`;
    // an array NESTED inside an object needs no such treatment — XMLBuilder
    // already repeats an array's own key as the sibling tag per entry.
    const wrapped = schema.type === 'array' ? { [rootElement]: { [itemElement]: data } } : { [rootElement]: data }

    const builder = new XMLBuilder({ format: true, indentBy: '  ', ignoreAttributes: true })
    const xml = builder.build(wrapped) as string
    downloadTextFile(xml, fileName, 'application/xml')
  }, [data, schema.type, rootElement, itemElement, fileName])

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
    </Box>
  )
}

export default withJsonFormsControlProps(XmlExportControl)
