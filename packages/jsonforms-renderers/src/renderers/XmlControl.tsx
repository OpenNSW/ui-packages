import { useJsonForms, withJsonFormsControlProps } from '@jsonforms/react'
import { update } from '@jsonforms/core'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Button, Flex, IconButton, Spinner, Text, Tooltip } from '@radix-ui/themes'
import { UploadIcon, Cross2Icon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { isEditable } from '../utils/editable'
import { getErrorMessage } from '../utils/error'
import { formatBytes, formatAccept } from '../utils/format'
import { XmlParseError, parseXmlToDocument, type XmlDocument } from '../utils/xml'
import { resolveWrites, type WriteToEntry } from '../utils/mapping'

interface XXmlOptions {
  /** Accepted file types: comma-separated MIME types, wildcards, or extensions (.xml). */
  accept?: string
  /** Max upload size in bytes. */
  maxSize?: number
  /**
   * Element paths that must ALWAYS parse as an array, even when the uploaded
   * document happens to contain exactly one. A dotted path including the root
   * ("salesData.sale") or a bare tag name to match at any depth.
   * Without this the persisted shape depends on how many of that element the
   * uploaded file happened to have — see docs/xml-control.md.
   */
  arrayPaths?: string[]
  /** Strip namespace prefixes from element and attribute names. Default false. */
  removeNamespaces?: boolean
  /**
   * Map values out of the parsed document onto other fields, filling a form
   * from one upload. Each entry's `to` is a dot-joined data path, resolved
   * from the form root or from this control's own record depending on
   * `writeBase` — see utils/mapping.ts and docs/xml-control.md.
   */
  writeTo?: WriteToEntry[]
  /**
   * Where `writeTo` paths are resolved from. Default 'root' — absolute from
   * the form data root, so one importer reaches a top-level field and a fixed
   * array index alike.
   *
   * 'parent' resolves them against this control's own containing object, the
   * way `x-computed.inputs` reads. That is what lets an importer sit inside
   * each array item and fill only that item: without it every item's importer
   * writes the same absolute paths, so the second one overwrites the first.
   *
   * 'parent' means the containing OBJECT, not the array item — an importer
   * nested in a sub-object of an item rebases onto that sub-object. Keep it a
   * direct property of the item.
   */
  writeBase?: 'root' | 'parent'
  /**
   * Keep the parsed document as this field's own value. Default true.
   *
   * Set false when writeTo has already distributed everything worth keeping:
   * the raw document is then working data rather than part of the submission,
   * and storing it as well would duplicate every mapped value.
   */
  persistDocument?: boolean
}

type XmlControlProps = ControlProps & {
  schema: JsonSchema & { 'x-xml'?: XXmlOptions }
}

type Status = 'empty' | 'parsing' | 'ready' | 'error'

const DEFAULT_ACCEPT = '.xml,text/xml,application/xml'
// 5 MB rather than SpreadsheetControl's 10 MB: XML is uncompressed text that
// expands many times over as a JS object graph, and this lines up with the
// MAX_XML_CHARS bound the parser applies after decoding.
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024

const XmlControl = ({
  data,
  handleChange,
  path,
  label,
  required,
  schema,
  enabled,
  readonly,
  errors,
  visible = true,
}: XmlControlProps) => {
  // Clears to `undefined`, not `null` — this control's schema is `type:
  // 'object'`, which `null` does NOT satisfy, so writing null would leave the
  // field permanently failing validation with "must be object" and no way to
  // recover short of uploading again. `undefined` means "no file uploaded",
  // which is exactly the state a never-touched field is already in.
  useClearWhenHidden(visible, path, handleChange)

  const isValid = !errors || errors.length === 0
  // `enabled` and `readonly` are computed independently by @jsonforms/core, and
  // for this control they mean the same thing: show whatever data exists, but
  // don't allow uploading a replacement or removing it.
  const canEdit = isEditable(enabled, readonly)

  const xXml: XXmlOptions = schema?.['x-xml'] ?? {}

  const accept = xXml.accept ?? DEFAULT_ACCEPT
  const maxSize = xXml.maxSize ?? DEFAULT_MAX_SIZE
  const arrayPaths = xXml.arrayPaths
  const removeNamespaces = xXml.removeNamespaces === true
  const writeTo = xXml.writeTo
  const writeBase = xXml.writeBase ?? 'root'
  const persistDocument = xXml.persistDocument !== false

  // Writing outside this control's own path is the whole point of writeTo, so
  // it needs the raw dispatch rather than handleChange, which is bound to
  // `path`. Same mechanism AutoFillGroupControl uses to fill sibling fields.
  const ctx = useJsonForms()

  // The field's value IS the parsed document — no wrapper to unpack.
  const value = (data ?? null) as XmlDocument | null

  const [status, setStatus] = useState<Status>(() => (value ? 'ready' : 'empty'))
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Bumped on every upload attempt and on removal. processFile awaits twice
  // before committing, so without this a slow parse can land after a faster
  // one started later and overwrite it — or land after the user pressed
  // remove and restore the document they just discarded.
  const uploadSequence = useRef(0)

  const hasValue = value != null

  // Configuring writeTo makes this an action that fills other fields, not a
  // field that holds a document — so it renders as one button rather than a
  // drop target. persistDocument deliberately does NOT affect this: that
  // option is about what gets stored, not about what the control is for.
  const isImporter = writeTo !== undefined && writeTo.length > 0

  const processFile = useCallback(
    async (file: File) => {
      const sequence = ++uploadSequence.current
      setError(null)

      if (file.size > maxSize) {
        setError(`File exceeds the ${formatBytes(maxSize)} limit.`)
        return
      }

      const acceptedTypes = accept.split(',').map((t) => t.trim())
      const typeOk = acceptedTypes.some((type) => {
        if (type === '*' || type === '*/*') return true
        if (type.endsWith('/*')) return file.type.startsWith(type.slice(0, -1))
        if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type.toLowerCase())
        return file.type === type
      })
      if (!typeOk) {
        setError(`Invalid type. Accepted: ${formatAccept(accept)}`)
        return
      }

      setStatus('parsing')

      let parsed: XmlDocument
      try {
        const text = await file.text()
        parsed = await parseXmlToDocument(text, { arrayPaths, removeNamespaces })
      } catch (err) {
        // A superseded attempt must not report its failure over whatever
        // replaced it, any more than it may report success below.
        if (sequence !== uploadSequence.current) return
        setStatus('error')
        // Every rejection parseXmlToDocument makes is already phrased for an end
        // user, so its message renders directly; the fallback only covers a
        // genuinely unexpected throw (e.g. file.text() failing).
        setError(
          err instanceof XmlParseError
            ? err.message
            : "This doesn't look like a valid XML document. Please check the file and try again.",
        )
        return
      }

      // Resolved before anything is committed, so a mapping that cannot be
      // evaluated reports itself instead of half-filling the form.
      let writes: { to: string; value: unknown }[] = []
      if (writeTo && writeTo.length > 0) {
        try {
          writes = await resolveWrites(parsed, writeTo)
        } catch (err) {
          if (sequence !== uploadSequence.current) return
          setStatus('error')
          setError(err instanceof Error ? err.message : 'This document could not be mapped onto the form.')
          return
        }
      }

      if (sequence !== uploadSequence.current) return
      if (persistDocument) handleChange(path, parsed)
      // `path` is this control's own field, so its parent is the record the
      // writes belong to. At the form root that is '', which is exactly the
      // absolute behaviour — so 'parent' on a top-level control is a no-op.
      const base = writeBase === 'parent' ? path.split('.').slice(0, -1).join('.') : ''
      for (const write of writes) ctx.dispatch?.(update(base ? `${base}.${write.to}` : write.to, () => write.value))
      setStatus('ready')
    },
    [accept, maxSize, arrayPaths, removeNamespaces, writeTo, writeBase, persistDocument, path, handleChange, ctx],
  )

  if (visible === false) {
    return null
  }

  if (!canEdit && !hasValue) return null

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (!canEdit) return
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (!canEdit) return
    if (e.dataTransfer.files?.[0]) void processFile(e.dataTransfer.files[0])
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      void processFile(e.target.files[0])
      e.target.value = ''
    }
  }

  const handleRemove = () => {
    if (!canEdit) return
    // Supersedes any parse still in flight, so it can't restore what's being
    // removed here.
    ++uploadSequence.current
    setError(null)
    setStatus('empty')
    // `undefined`, not `null` — see the useClearWhenHidden note above.
    handleChange(path, undefined)
  }

  return (
    <Box mb="4">
      {/* ── Header row ── */}
      <Flex align="center" justify="between" mb="2">
        <Flex align="center" gap="1">
          <Text as="label" size="2" weight="bold">
            {label}
            {required && <Text color="red"> *</Text>}
          </Text>
          {!isImporter && hasValue && canEdit && (
            <>
              <Tooltip content="Replace document">
                <IconButton
                  variant="ghost"
                  size="1"
                  onClick={() => inputRef.current?.click()}
                  aria-label="Replace document"
                >
                  <UploadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip content="Remove document">
                <IconButton variant="ghost" size="1" color="gray" onClick={handleRemove} aria-label="Remove document">
                  <Cross2Icon />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Flex>
        <Flex align="center" gap="2">
          <Text size="1" color="gray">
            {formatBytes(maxSize)} max · {formatAccept(accept)}
          </Text>
          {/* One button, whatever persistDocument says, and deliberately never
              labelled "Replace" or paired with a remove. Neither would be
              honest: this control's writes land in OTHER fields, so removing
              the document here would leave every field the import filled, and
              "replace" describes swapping one held thing for another rather
              than a second import overwriting what the first one wrote. */}
          {isImporter && canEdit && (
            <Button size="1" variant="soft" onClick={() => inputRef.current?.click()} disabled={status === 'parsing'}>
              {status === 'parsing' ? <Spinner size="1" /> : <UploadIcon />}
              Upload
            </Button>
          )}
        </Flex>
      </Flex>

      {/* An importer has no dropzone, and a replacement upload's error has
          nowhere else to go once a document exists — the dropzone is the only
          other place `error` is shown. */}
      {(isImporter || hasValue) && error && (
        <Text size="2" color="red" mb="2" style={{ display: 'block' }}>
          {error}
        </Text>
      )}

      {/* Hidden file input — triggered by the dropzone below, by the header's
          compact "replace" button once a document exists, or by the importer's
          Upload button. */}
      <input ref={inputRef} type="file" style={{ display: 'none' }} accept={accept} onChange={handleInputChange} />

      {/* ── Drop zone — empty state of a plain parse-and-hold field only ── */}
      {!isImporter && canEdit && !hasValue && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{ cursor: 'pointer' }}
          className={[
            'border-2 border-dashed rounded-lg p-6 text-center',
            'transition-all duration-200 ease-in-out',
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : error
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
          ].join(' ')}
        >
          <Flex direction="column" align="center" gap="2">
            {status === 'parsing' ? (
              <>
                <Spinner size="3" />
                <Text size="2" color="gray">
                  Parsing document…
                </Text>
              </>
            ) : error ? (
              <>
                <ExclamationTriangleIcon style={{ width: 32, height: 32, color: 'var(--red-9)' }} />
                <Text size="2" color="red" weight="medium">
                  {error}
                </Text>
                <Text size="1" color="gray">
                  Click to try again
                </Text>
              </>
            ) : (
              <>
                <UploadIcon style={{ width: 32, height: 32, color: 'var(--gray-8)' }} />
                <Text size="2" weight="medium">
                  Click to upload or drag and drop
                </Text>
                <Text size="1" color="gray">
                  {formatBytes(maxSize)} max · {formatAccept(accept)}
                </Text>
              </>
            )}
          </Flex>
        </div>
      )}

      {!isValid && (
        <Text color="red" size="1" mt="2" style={{ display: 'block' }}>
          {getErrorMessage(errors, label)}
        </Text>
      )}
    </Box>
  )
}

export default withJsonFormsControlProps(XmlControl)
