import { withJsonFormsControlProps } from '@jsonforms/react'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Flex, IconButton, Spinner, Table, Text, Tooltip } from '@radix-ui/themes'
import { UploadIcon, Cross2Icon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { isEditable } from '../utils/editable'
import { getErrorMessage } from '../utils/error'
import { formatBytes, formatAccept } from '../utils/format'
import {
  parseWorkbookToMatrix,
  columnLetter,
  processMatrix,
  SheetParseError,
  type CellValue,
  type FormulaConfigEntry,
  type SpreadsheetValue,
} from '../utils/spreadsheet'

interface XSpreadsheetOptions {
  /** Accepted file types: comma-separated MIME types, wildcards (image/*), or extensions (.xlsx). */
  accept?: string
  /** Max upload size in bytes. */
  maxSize?: number
  /** Include the parsed sheet in the persisted value, so it survives a reload. Default true. */
  persistSheet?: boolean
  /** Use row 1's values as column labels instead of A/B/C. Default false. */
  columnHeader?: boolean
  /** Use column A's values as row labels instead of 1/2/3. Default false. */
  rowHeader?: boolean
  /** Render the grid preview at all. Default true — set false to show only computed values. */
  showSheet?: boolean
  /** Which sheet to read by name. Defaults to the workbook's first sheet if omitted. */
  sheetName?: string
}

type SpreadsheetControlProps = ControlProps & {
  schema: JsonSchema & { 'x-spreadsheet'?: XSpreadsheetOptions; 'x-evaluate'?: FormulaConfigEntry[] }
}

type Status = 'empty' | 'parsing' | 'ready' | 'error'

const DEFAULT_ACCEPT =
  '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv'
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024
const MAX_PREVIEW_ROWS = 200
const MAX_PREVIEW_COLS = 50
const EMPTY_FORMULAS: FormulaConfigEntry[] = []

function formatCell(cell: CellValue | undefined): string {
  if (cell == null || cell === '') return ''
  if (cell instanceof Date) return cell.toLocaleDateString()
  return String(cell)
}

const SpreadsheetControl = ({
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
}: SpreadsheetControlProps) => {
  useClearWhenHidden(visible, path, handleChange, null)

  const isValid = !errors || errors.length === 0
  // `enabled` and `readonly` are independently computed by @jsonforms/core
  // (see mapStateToControlProps) — `enabled` only happens to reflect a schema
  // `readOnly: true` under this library's default `separateReadonlyFromDisabled:
  // false` config, and never reflects a uischema READONLY *rule* in any config.
  // Since this is a generic, reusable renderer whose consuming app may use
  // either, check both explicitly rather than relying on that incidental fold-in.
  // For this control, "disabled" and "readonly" mean the same thing: show
  // whatever data exists, but don't allow uploading a replacement or removing it.
  const canEdit = isEditable(enabled, readonly)

  const xSpreadsheet: XSpreadsheetOptions = schema?.['x-spreadsheet'] ?? {}
  const xEvaluate: FormulaConfigEntry[] = schema?.['x-evaluate'] ?? EMPTY_FORMULAS

  const accept = xSpreadsheet.accept ?? DEFAULT_ACCEPT
  const maxSize = xSpreadsheet.maxSize ?? DEFAULT_MAX_SIZE
  const persistSheet = xSpreadsheet.persistSheet !== false
  const columnHeader = xSpreadsheet.columnHeader === true
  const rowHeader = xSpreadsheet.rowHeader === true
  const showSheet = xSpreadsheet.showSheet !== false
  const sheetName = xSpreadsheet.sheetName

  const value = (data ?? null) as SpreadsheetValue | null

  const [status, setStatus] = useState<Status>(() =>
    value?.sheet || Object.keys(value?.derivations ?? {}).length > 0 ? 'ready' : 'empty',
  )
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [localMatrix, setLocalMatrix] = useState<CellValue[][] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // The grid always renders from localMatrix first — so even with
  // persistSheet: false, a fresh upload shows immediately this session, even
  // though it won't survive a reload.
  const matrix = localMatrix ?? value?.sheet ?? null
  const derivations = value?.derivations ?? {}
  const hasValue = matrix != null || value != null

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

      let parsedMatrix: CellValue[][]
      try {
        const buffer = await file.arrayBuffer()
        parsedMatrix = parseWorkbookToMatrix(buffer, sheetName).matrix
      } catch (err) {
        setStatus('error')
        setError(
          err instanceof SheetParseError
            ? err.message
            : "This doesn't look like a valid spreadsheet. Please check the file and try again.",
        )
        return
      }

      setLocalMatrix(parsedMatrix)
      const value = await processMatrix(parsedMatrix, xEvaluate, { persistSheet })
      handleChange(path, value)
      setStatus('ready')
    },
    [accept, maxSize, persistSheet, sheetName, xEvaluate, path, handleChange],
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
    setLocalMatrix(null)
    setError(null)
    setStatus('empty')
    handleChange(path, null)
  }

  // columnHeader consumes row 0 as the header; rowHeader consumes column 0 as
  // row labels — offset the body so the header row/column is never also
  // rendered as a data row/column.
  const rowOffset = columnHeader ? 1 : 0
  const colOffset = rowHeader ? 1 : 0
  const bodyRows = matrix ? matrix.slice(rowOffset) : []
  const visibleRows = bodyRows.slice(0, MAX_PREVIEW_ROWS)
  const colCount = Math.min(
    MAX_PREVIEW_COLS,
    Math.max(0, ...visibleRows.map((row) => Math.max(0, row.length - colOffset))),
  )
  const colIndices = Array.from({ length: colCount }, (_, i) => i + colOffset)
  const showStoredNote = showSheet && matrix == null && value != null
  const cornerLabel = columnHeader && rowHeader ? formatCell(matrix?.[0]?.[0]) : ''

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
              <Tooltip content="Replace spreadsheet">
                <IconButton
                  variant="ghost"
                  size="1"
                  onClick={() => inputRef.current?.click()}
                  aria-label="Replace spreadsheet"
                >
                  <UploadIcon />
                </IconButton>
              </Tooltip>
              <Tooltip content="Remove spreadsheet">
                <IconButton
                  variant="ghost"
                  size="1"
                  color="gray"
                  onClick={handleRemove}
                  aria-label="Remove spreadsheet"
                >
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
          render once a file already exists — the dropzone (the only other
          place `error` is shown) is hidden whenever `hasValue` is true. */}
      {hasValue && error && (
        <Text size="2" color="red" mb="2" style={{ display: 'block' }}>
          {error}
        </Text>
      )}

      {/* Hidden file input — triggered by the empty-state dropzone below and
          by the compact "replace" button in the header once a file exists. */}
      <input ref={inputRef} type="file" style={{ display: 'none' }} accept={accept} onChange={handleInputChange} />

      {/* ── Drop zone — empty state only; once a file exists, the compact
          header controls above handle replace/remove instead ── */}
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
                  Parsing spreadsheet…
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

      {/* ── Sheet preview grid, or a note when it wasn't persisted ── */}
      {matrix && showSheet && (
        <Box mt="3">
          <Box style={{ overflow: 'auto', maxHeight: 420 }}>
            <Table.Root variant="surface" size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>{cornerLabel}</Table.ColumnHeaderCell>
                  {colIndices.map((c) => (
                    <Table.ColumnHeaderCell key={c}>
                      {columnHeader ? formatCell(matrix[0]?.[c]) : columnLetter(c)}
                    </Table.ColumnHeaderCell>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {visibleRows.map((row, r) => {
                  const actualRow = rowOffset + r
                  return (
                    <Table.Row key={r}>
                      <Table.RowHeaderCell>
                        {rowHeader ? formatCell(matrix[actualRow]?.[0]) : actualRow + 1}
                      </Table.RowHeaderCell>
                      {colIndices.map((c) => (
                        <Table.Cell key={c}>{formatCell(row[c])}</Table.Cell>
                      ))}
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table.Root>
          </Box>
          {bodyRows.length > MAX_PREVIEW_ROWS && (
            <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
              Showing first {MAX_PREVIEW_ROWS} of {bodyRows.length} rows
            </Text>
          )}
        </Box>
      )}
      {showStoredNote && (
        <Text size="2" color="gray" mt="3" style={{ display: 'block' }}>
          Sheet preview not stored for this field — re-upload to view contents.
        </Text>
      )}

      {/* ── Computed values panel — only when x-evaluate produced something ── */}
      {Object.keys(derivations).length > 0 && (
        <Box mt="3">
          <Text size="2" weight="bold" as="div" mb="1">
            Computed values
          </Text>
          <Flex direction="column" gap="1">
            {Object.entries(derivations).map(([id, d]) => (
              <Flex key={id} justify="between">
                <Text size="2">{d.label}</Text>
                {d.error ? (
                  <Text size="2" color="red">
                    {d.error}
                  </Text>
                ) : (
                  // d.value is CellValue | null now (SUM/AVERAGE aren't the only
                  // possible results anymore — INDEX/CONCATENATE can return a
                  // string, a bare comparison can return a boolean, etc.), so
                  // `.toLocaleString()` would throw for e.g. a boolean result.
                  // Reuse the same formatCell used for the sheet-preview grid.
                  <Text size="2">{formatCell(d.value)}</Text>
                )}
              </Flex>
            ))}
          </Flex>
        </Box>
      )}

      {!isValid && (
        <Text color="red" size="1" mt="2" style={{ display: 'block' }}>
          {getErrorMessage(errors, label)}
        </Text>
      )}
    </Box>
  )
}

export default withJsonFormsControlProps(SpreadsheetControl)
