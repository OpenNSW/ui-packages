import { useJsonForms, withJsonFormsControlProps } from '@jsonforms/react'
import { Resolve } from '@jsonforms/core'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Flex, IconButton, Spinner, Table, Text, Tooltip } from '@radix-ui/themes'
import { UploadIcon, Cross2Icon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { isEditable } from '../utils/editable'
import { getErrorMessage } from '../utils/error'
import { formatBytes, formatAccept } from '../utils/format'
import {
  parseWorkbookToMatrix,
  columnLetter,
  processMatrix,
  isRecordsSheet,
  buildDerivations,
  sameDerivations,
  evaluateExpressions,
  SheetParseError,
  type CellValue,
  type DerivationResult,
  type FormulaConfigEntry,
  type SpreadsheetValue,
} from '../utils/spreadsheet'
import { recordsToMatrix, selectSheetSource } from '../utils/records'

interface XSpreadsheetOptions {
  /** Accepted file types: comma-separated MIME types, wildcards (image/*), or extensions (.xlsx). */
  accept?: string
  /** Max upload size in bytes. */
  maxSize?: number
  /** Include the parsed sheet in the persisted value, so it survives a reload. Default true. */
  persistSheet?: boolean
  /**
   * Use row 1's values as column labels in the preview, AND persist `sheet`
   * as one record per data row, keyed by those labels, instead of a raw
   * matrix. Default false. Cannot be combined with rowHeader — see
   * docs/spreadsheet-value-shape.md.
   */
  columnHeader?: boolean
  /**
   * Use column A's values as row labels in the preview, AND (only when
   * columnHeader is not also set) persist `sheet` as one record per OTHER
   * column, transposed, keyed by those labels. Default false. Cannot be
   * combined with columnHeader — see docs/spreadsheet-value-shape.md.
   */
  rowHeader?: boolean
  /** Render the grid preview at all. Default true — set false to show only computed values. */
  showSheet?: boolean
  /** Which sheet to read by name. Defaults to the workbook's first sheet if omitted. */
  sheetName?: string
  /**
   * Read the data from elsewhere in the form instead of from an upload: a dotted
   * path, relative to this control's own parent object, exactly as
   * x-computed.inputs paths are. Any non-empty string switches the control into
   * source mode — no upload, replace or remove, and only `derivations` is
   * persisted, since the data itself belongs to whichever field produced it.
   *
   * The path may resolve to a 2-D array (addressed literally, like an uploaded
   * sheet) or to an array of objects (flattened to a header row plus one row per
   * record, so data starts at row 2). accept, maxSize, sheetName and persistSheet
   * are inert in this mode; columnHeader, rowHeader and showSheet still apply,
   * since they describe how to render the data.
   */
  sourcePath?: string
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
  const sourcePath = typeof xSpreadsheet.sourcePath === 'string' ? xSpreadsheet.sourcePath.trim() : ''
  const sourceMode = sourcePath !== ''

  // Read from the whole-form context in the RENDER BODY, not inside the effect
  // below — that is what lets the effect re-fire when the SOURCE field changes,
  // since neither this control's own `path` nor its own `data` moves on that
  // write. Same mechanism ComputedControl uses to follow a sibling.
  const ctx = useJsonForms()
  const parentPath = path.split('.').slice(0, -1).join('.')
  // Resolve.data is declared `any`; landing it in an explicitly `unknown`
  // binding is the whole narrowing story — selectSheetSource below is what
  // actually establishes the shape.
  const resolvedSource: unknown = sourceMode
    ? Resolve.data(ctx.core?.data, parentPath ? `${parentPath}.${sourcePath}` : sourcePath)
    : undefined
  // Memoized on the resolved value's REFERENCE, deliberately not on a
  // stringification of it: the core reducer writes with lodash fp/set ->
  // cloneByPath, a shallow clone along the written path only, so an unrelated
  // edit elsewhere in the form leaves this value's identity untouched while a
  // write inside it does not — exactly when a recompute is wanted. Every write
  // re-renders every context consumer (UPDATE_DATA has no equality bail-out),
  // so stringifying a large array here would cost on every keystroke.
  const source = useMemo(() => selectSheetSource(resolvedSource), [resolvedSource])
  const formReadonly = ctx.readonly === true

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
  // though it won't survive a reload. localMatrix (this session's own
  // freshly parsed upload) is always matrix-shaped — shaping only happens
  // when building the PERSISTED value — so a fresh upload always renders via
  // the matrix branch this session; only a reload (no localMatrix, reading
  // the already-shaped persisted value back) can render via the records
  // branch below. Told apart via isRecordsSheet, not a stored field.
  // Source mode feeds the SAME two locals the upload path builds, which is what
  // lets every preview, option and formula path below be reused untouched — a
  // resolved 2-D array renders through the matrix branch, resolved records
  // through the records branch, exactly as a persisted sheet of either shape
  // already does.
  const persistedSheet = value?.sheet ?? null
  const matrix = sourceMode
    ? source.status === 'matrix'
      ? source.matrix
      : null
    : (localMatrix ?? (persistedSheet && !isRecordsSheet(persistedSheet) ? persistedSheet : null))
  const records = sourceMode
    ? source.status === 'records' && source.records.length > 0
      ? (source.records as Record<string, CellValue>[])
      : null
    : localMatrix == null && persistedSheet && isRecordsSheet(persistedSheet)
      ? persistedSheet
      : null
  const derivations = value?.derivations ?? {}
  // records != null always implies value != null (records is derived only
  // from value?.sheet), so this already covers the records case too.
  const hasValue = matrix != null || value != null

  // Memoized so the preview is only rebuilt when the data or the display
  // options actually change. This control now subscribes to whole-form data
  // (for sourcePath resolution), so it re-renders on every edit anywhere in
  // the form — without this, a 200-row grid would be reconciled on each one.
  const sheetPreview = useMemo(() => {
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
    // columnHeader && rowHeader together is rejected above, so there's never a
    // meaningful corner cell to show here — the header row/column consumes it.
    const cornerLabel = ''
    // rowHeader alone means every cell in the column-header row below is blank
    // (see its own comment) — the whole row would just be dead space, so skip
    // it entirely and lean on the row-label column's distinct styling instead.
    const suppressColumnHeaderRow = rowHeader && !columnHeader

    // records-mode preview: no row/col "offset" concept (shapeSheet already
    // consumed the header row/column when building each record) — just the
    // same MAX_PREVIEW_ROWS/COLS truncation the matrix branch above uses.
    // Headers are the union of all VISIBLE records' own keys, not just the
    // first record's — every record shapeSheet itself produces has an
    // identical key set, so this only matters for a hand-supplied `data`
    // value with non-uniform records (sheet crosses a serialization boundary
    // — it isn't guaranteed to have been produced by shapeSheet).
    const visibleRecords = records ? records.slice(0, MAX_PREVIEW_ROWS) : []
    const recordHeaders = Array.from(new Set(visibleRecords.flatMap((r) => Object.keys(r)))).slice(0, MAX_PREVIEW_COLS)

    return (
      <>
        {/* ── Sheet preview grid, or a note when it wasn't persisted ── */}
        {matrix && showSheet && (
          <Box mt="3">
            <Box style={{ overflow: 'auto', maxHeight: 420 }}>
              <Table.Root variant="surface" size="1">
                {!suppressColumnHeaderRow && (
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>{cornerLabel}</Table.ColumnHeaderCell>
                      {colIndices.map((c) => (
                        // This row only renders when rowHeader isn't the sole
                        // flag set (see suppressColumnHeaderRow) — so reaching
                        // here, either columnHeader is true (real labels) or
                        // both are false (columnLetter fallback).
                        <Table.ColumnHeaderCell key={c}>
                          {columnHeader ? formatCell(matrix[0]?.[c]) : columnLetter(c)}
                        </Table.ColumnHeaderCell>
                      ))}
                    </Table.Row>
                  </Table.Header>
                )}
                <Table.Body>
                  {visibleRows.map((row, r) => {
                    const actualRow = rowOffset + r
                    return (
                      <Table.Row key={r}>
                        <Table.RowHeaderCell
                          style={rowHeader ? { fontWeight: 700, background: 'var(--gray-a3)' } : undefined}
                        >
                          {/* columnHeader alone means these are shaped into
                                records keyed by row 1 — a 1/2/3 fallback number
                                here isn't a real label, so it's suppressed (the
                                column-header row above stays, since it's real
                                labels there, not suppressed). */}
                          {rowHeader ? formatCell(matrix[actualRow]?.[0]) : columnHeader ? '' : actualRow + 1}
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

        {/* ── Records-shaped sheet preview — reload of an already-persisted,
              columnHeader/rowHeader-shaped value; mutually exclusive with the
              matrix preview above ── */}
        {records && showSheet && (
          <Box mt="3">
            <Box style={{ overflow: 'auto', maxHeight: 420 }}>
              <Table.Root variant="surface" size="1">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell />
                    {recordHeaders.map((key) => (
                      <Table.ColumnHeaderCell key={key}>{key}</Table.ColumnHeaderCell>
                    ))}
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {visibleRecords.map((record, r) => (
                    <Table.Row key={r}>
                      <Table.RowHeaderCell>{r + 1}</Table.RowHeaderCell>
                      {recordHeaders.map((key) => (
                        <Table.Cell key={key}>{formatCell(record[key])}</Table.Cell>
                      ))}
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
            {records.length > MAX_PREVIEW_ROWS && (
              <Text size="1" color="gray" mt="1" style={{ display: 'block' }}>
                Showing first {MAX_PREVIEW_ROWS} of {records.length} rows
              </Text>
            )}
          </Box>
        )}
      </>
    )
  }, [matrix, records, showSheet, columnHeader, rowHeader])

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

      let value: SpreadsheetValue
      try {
        value = await processMatrix(parsedMatrix, xEvaluate, { persistSheet, columnHeader, rowHeader })
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to process the uploaded spreadsheet.')
        return
      }
      handleChange(path, value)
      setStatus('ready')
    },
    [accept, maxSize, persistSheet, columnHeader, rowHeader, sheetName, xEvaluate, path, handleChange],
  )

  // ── Source mode: evaluate whenever the source data changes ──
  // Upload mode computes from a user file event in processFile above; source
  // mode has no event to hang off, so it follows the resolved value instead.
  useEffect(() => {
    if (!sourceMode) return

    // Nothing configured to compute means nothing to persist. Keeping this
    // control write-free in that case makes it usable as a plain "render this
    // array" field without dirtying the form.
    if (xEvaluate.length === 0) return

    let cancelled = false

    const persist = (next: Record<string, DerivationResult>) => {
      // Whole-form readonly gates PERSISTING only, never computing — same
      // reasoning as ComputedControl: silently rewriting a stored record's
      // derivations, or tripping a host's autosave, is worse than showing a
      // freshly computed value the user cannot save.
      if (formReadonly) return
      // The map is rebuilt on every run, so a reference check would always
      // report a change and mark a saved form dirty the moment it opened.
      if (!sameDerivations(value?.derivations, next)) handleChange(path, { derivations: next })
    }

    const formulaMatrix =
      source.status === 'matrix' ? source.matrix : source.status === 'records' ? recordsToMatrix(source.records) : []

    if (formulaMatrix.length === 0) {
      // Don't hand an empty matrix to the engine: evaluateExpressions
      // short-circuits that to one #ERROR! per entry, which reads as "your
      // formula is broken" when the truth is the source field is still empty.
      // Clear stale results, but never dirty a pristine field just to write {}.
      if (value != null) persist(Object.create(null) as Record<string, DerivationResult>)
      return
    }

    void evaluateExpressions(formulaMatrix, xEvaluate).then((results) => {
      // A source change landing mid-evaluation could otherwise let an older
      // result overwrite a newer one.
      if (cancelled) return
      persist(buildDerivations(results))
    })

    return () => {
      cancelled = true
    }
    // Deliberately not keyed on `value`/`data`/`path`/`handleChange`, which this
    // effect itself writes to; `source` carries the resolved reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, source, xEvaluate, formReadonly])

  if (visible === false) {
    return null
  }

  // columnHeader and rowHeader are independently meaningful for the persisted
  // records shape (see shapeSheet in utils/spreadsheet/process.ts) — neither
  // one is a safe default when both are set, so this is rejected outright
  // rather than silently picking a winner.
  if (columnHeader && rowHeader) {
    return (
      <Box mb="4">
        <Text as="label" size="2" weight="bold">
          {label}
        </Text>
        <Text size="2" color="red" style={{ display: 'block' }}>
          Invalid x-spreadsheet config: columnHeader and rowHeader cannot both be true — pick one orientation.
        </Text>
      </Box>
    )
  }

  if (!sourceMode && !canEdit && !hasValue) return null

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

  const showStoredNote = !sourceMode && showSheet && matrix == null && records == null && value != null
  return (
    <Box mb="4">
      {/* ── Header row ── */}
      <Flex align="center" justify="between" mb="2">
        <Flex align="center" gap="1">
          <Text as="label" size="2" weight="bold">
            {label}
            {required && <Text color="red"> *</Text>}
          </Text>
          {!sourceMode && hasValue && canEdit && (
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
        {!sourceMode && (
          <Text size="1" color="gray">
            {formatBytes(maxSize)} max · {formatAccept(accept)}
          </Text>
        )}
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
      {!sourceMode && (
        <input ref={inputRef} type="file" style={{ display: 'none' }} accept={accept} onChange={handleInputChange} />
      )}

      {/* ── Source mode: what the path resolved to, when it isn't rows ──
          Each of these is a normal state rather than an error: an upstream field
          the user hasn't filled in yet is the common case. ── */}
      {sourceMode && source.status === 'missing' && (
        <Text size="2" color="gray" style={{ display: 'block' }}>
          No data available yet.
        </Text>
      )}
      {sourceMode && source.status === 'invalid' && (
        <Text size="2" color="red" style={{ display: 'block' }}>
          {`x-spreadsheet.sourcePath "${sourcePath}" doesn't point at rows or records.`}
        </Text>
      )}
      {sourceMode && source.status === 'records' && source.records.length === 0 && (
        <Text size="2" color="gray" style={{ display: 'block' }}>
          No rows yet.
        </Text>
      )}

      {/* ── Drop zone — empty state only; once a file exists, the compact
          header controls above handle replace/remove instead ── */}
      {!sourceMode && canEdit && !hasValue && (
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

      {sheetPreview}
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
