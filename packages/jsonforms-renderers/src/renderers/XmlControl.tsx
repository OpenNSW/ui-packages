import { withJsonFormsControlProps } from '@jsonforms/react'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Flex, IconButton, Spinner, Text, Tooltip } from '@radix-ui/themes'
import { UploadIcon, Cross2Icon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { isEditable } from '../utils/editable'
import { getErrorMessage } from '../utils/error'
import { formatBytes, formatAccept } from '../utils/format'
import { XmlParseError, parseXmlToDocument, type XmlDocument } from '../utils/xml'

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

  // The field's value IS the parsed document — no wrapper to unpack.
  const value = (data ?? null) as XmlDocument | null

  const [status, setStatus] = useState<Status>(() => (value ? 'ready' : 'empty'))
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const hasValue = value != null

  const processFile = useCallback(
    async (file: File) => {
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

      handleChange(path, parsed)
      setStatus('ready')
    },
    [accept, maxSize, arrayPaths, removeNamespaces, path, handleChange],
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
          {hasValue && canEdit && (
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
        <Text size="1" color="gray">
          {formatBytes(maxSize)} max · {formatAccept(accept)}
        </Text>
      </Flex>

      {/* A replacement upload's validation/parse error has nowhere else to
          render once a document already exists — the dropzone (the only other
          place `error` is shown) is hidden whenever `hasValue` is true. */}
      {hasValue && error && (
        <Text size="2" color="red" mb="2" style={{ display: 'block' }}>
          {error}
        </Text>
      )}

      {/* Hidden file input — triggered by the empty-state dropzone below and by
          the compact "replace" button in the header once a document exists. */}
      <input ref={inputRef} type="file" style={{ display: 'none' }} accept={accept} onChange={handleInputChange} />

      {/* ── Drop zone — empty state only ── */}
      {canEdit && !hasValue && (
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
