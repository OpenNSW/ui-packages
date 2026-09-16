import { withJsonFormsControlProps } from '@jsonforms/react'
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
  isRecordsSheet,
  buildDerivations,
  shapeSheet,
  sameDerivations,
  sameSheetData,
  evaluateExpressions,
  SheetParseError,
  type CellValue,
  type DerivationResult,
  type FormulaConfigEntry,
  type SheetData,
  type SpreadsheetValue,
} from '../utils/spreadsheet'
import { recordsToMatrix, transpose } from '../utils/records'

interface XSpreadsheetOptions {
  /** Accepted file types: comma-separated MIME types, wildcards (image/*), or extensions (.xlsx). */
  accept?: string
  /** Max upload size in bytes. */
  maxSize?: number
  /**
   * Include the sheet in the persisted value alongside `derivations`.
   * Defaults to whichever avoids the obvious mistake for the configured
   * source: true for an upload, where this control owns the only copy and
   * omitting it would lose the data.
   * already live in the field they were read from and persisting them again
   * would just store a second copy. Set it explicitly either way.
   */
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
   * Pin column order, as an ordered list of record keys, when rendering or
   * evaluating an array-of-objects sheet (e.g. one an XML importer wrote
   * straight into this field). Without it, column order is the union of
   * every record's keys in first-seen order — fine when every record's keys
   * arrive in the same order, but an x-evaluate formula addressing a fixed
   * column letter (e.g. SUM(I2:I10000)) breaks silently if that order ever
   * shifts. A key missing from this list still gets a column, appended
   * after, in first-seen order.
   */
  columns?: string[]
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
  const columnHeader = xSpreadsheet.columnHeader === true
  const rowHeader = xSpreadsheet.rowHeader === true
  const showSheet = xSpreadsheet.showSheet !== false
  const sheetName = xSpreadsheet.sheetName
  const persistSheet = xSpreadsheet.persistSheet !== false
  const columns = xSpreadsheet.columns

  const value = (data ?? null) as SpreadsheetValue | null

  const [status, setStatus] = useState<Status>(() =>
    value?.sheet || Object.keys(value?.derivations ?? {}).length > 0 ? 'ready' : 'empty',
  )
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [localMatrix, setLocalMatrix] = useState<CellValue[][] | null>(null)
  // The latest evaluation, kept so a readonly control still SHOWS its computed
  // values. persist() below refuses to store them, which would otherwise leave
  // a readonly field displaying stale derivations — or none at all — while the
  // effect quietly recomputed the right ones and threw them away. Same split
  // ComputedControl makes between displaying a value and saving it.
  //
  // Tagged with the matrix it was computed FROM, because evaluation is async
  // and several paths never reach it: an empty matrix short-circuits, and a
  // shapeSheet failure returns early. Untagged, the previous sheet's totals
  // would show beside the new sheet until evaluation landed — and for those two
  // paths, indefinitely.
  const [computed, setComputed] = useState<{
    matrix: CellValue[][]
    derivations: Record<string, DerivationResult>
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // The sheet this control has accounted for: the one it last persisted, or the
  // one that was already in the field when the user uploaded over it. Anything
  // ELSE turning up means someone else wrote — an importer adding rows, a host
  // loading another record — which retires the upload preview below.
  //
  // "Accounted for" rather than "wrote": a field can already hold a sheet when
  // the upload happens, and treating that pre-existing one as foreign would
  // discard the preview the instant it was created.
  const knownSheet = useRef<SheetData | null>(null)

  // Everything below renders from ONE matrix, whatever the data arrived as.
  // Records — resolved from a path, or read back from an already-shaped
  // persisted sheet — are flattened by recordsToMatrix, which puts the field
  // names in row 0: exactly the layout columnHeader describes, and exactly the
  // layout the formula engine addresses. rowHeader describes the other
  // orientation, so those get the quarter turn that makes the two shapes
  // round-trip (see transpose).
  //
  // Collapsing to one matrix is what makes columnHeader/rowHeader mean the same
  // thing regardless of source, and it keeps the preview's row numbering
  // honest: the row labelled 2 is the row =SUM(D2:D4) reads.
  const persistedSheet = value?.sheet ?? null

  const asMatrix = useCallback(
    (sheet: SheetData): CellValue[][] => {
      if (!isRecordsSheet(sheet)) return sheet
      const flattened = recordsToMatrix(sheet, columns)
      return rowHeader ? transpose(flattened) : flattened
    },
    [rowHeader, columns],
  )

  // Memoized because recordsToMatrix builds a fresh array every call: an
  // unmemoized matrix would be a new reference on every render, and the
  // evaluation effect keyed on it would re-fire, write, and re-render forever.
  const matrix = useMemo(() => {
    // localMatrix is this session's own freshly parsed upload, always
    // matrix-shaped because shaping only happens when building the PERSISTED
    // value. It wins so that a fresh upload still shows with persistSheet:
    // false, even though it won't survive a reload.
    // It is released as soon as something else replaces the field's sheet —
    // see the effect below — so it cannot go stale here.
    if (localMatrix != null) return localMatrix
    return persistedSheet ? asMatrix(persistedSheet) : null
  }, [localMatrix, persistedSheet, asMatrix])

  // Only the evaluation of the matrix on screen right now is shown; anything
  // else falls back to what is stored, which is the honest answer while a new
  // evaluation is still in flight or could not be made at all. Checking the tag
  // rather than clearing it also keeps this out of the effect, where a
  // synchronous setState would force a cascading render.
  const derivations = (computed?.matrix === matrix ? computed.derivations : null) ?? value?.derivations ?? {}
  const hasValue = matrix != null || value != null

  // Memoized so a 200-row grid is only rebuilt when the data or the display
  // options actually change, rather than on every render of the form.
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
      </>
    )
  }, [matrix, showSheet, columnHeader, rowHeader])

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

      // x-spreadsheet.columns pins column order for a records-shaped sheet
      // regardless of how it reached this field — a reload of a previously
      // shaped upload, or rows an importer wrote straight in, both go
      // through asMatrix(persistedSheet), further down. A FRESH upload never
      // did: it rendered straight from this raw parsed matrix, bypassing
      // that entirely. Round-tripping it through shapeSheet + asMatrix here
      // — key row out, columns-ordered matrix back in, in the same
      // orientation, since asMatrix re-applies the rowHeader transpose —
      // reuses that same pinning so it applies uniformly, not only after a
      // save-and-reload.
      if ((columnHeader || rowHeader) && columns && columns.length > 0) {
        try {
          parsedMatrix = asMatrix(shapeSheet(parsedMatrix, { columnHeader, rowHeader }))
        } catch (err) {
          setStatus('error')
          setError(err instanceof Error ? err.message : 'Failed to process this sheet.')
          return
        }
      }

      // Parsing ends here. Evaluating and persisting is the effect's job
      // below, for an upload exactly as for a sheet an importer wrote — one
      // matrix in, one evaluation, one write, whatever put the rows there.
      // Whatever is in the field right now is accounted for: this upload is
      // replacing it deliberately, so it must not read as someone else's write
      // and retire the preview that is about to be shown.
      knownSheet.current = (data as SpreadsheetValue | null)?.sheet ?? null
      setLocalMatrix(parsedMatrix)
      setStatus('ready')
    },
    [accept, maxSize, sheetName, data, columnHeader, rowHeader, columns, asMatrix],
  )

  // ── Release the upload preview when the field's sheet changes underneath it ──
  // Without this an upload wins FOREVER: removal was the only thing that
  // cleared it, so rows written into this field afterwards — by an importer, or
  // by a host loading a different record — were stored but neither rendered nor
  // evaluated, leaving the form computing from one sheet while holding another.
  //
  // It has to CLEAR rather than be ignored while stale. Merely preferring the
  // written sheet is self-cancelling: persisting the result makes the field's
  // sheet this control's own again, at which point the upload would win back
  // and be re-evaluated, flip-flopping and settling on the stale preview.
  //
  // An effect, deliberately. Adjusting during render is React's usual advice
  // for resetting state when a prop changes, but that would mean reading
  // knownSheet during render, which refs are not for.
  useEffect(() => {
    if (localMatrix == null) return
    // Nothing has replaced it. With persistSheet: false there is no stored
    // sheet at all, which is exactly when the preview matters most.
    if (persistedSheet == null) return
    // This control put it there itself, so it is not an external write.
    if (persistedSheet === knownSheet.current) return
    setLocalMatrix(null)
  }, [localMatrix, persistedSheet])

  // ── The one place this control evaluates and persists ──
  // Keyed on the rendered matrix rather than on a file event, so it does not
  // care what produced the rows: a user's upload, or an importer writing them
  // straight into this field. Both land in `matrix`, and both take this path.
  useEffect(() => {
    // Nothing to compute and nothing to store means nothing to write. Keeping
    // this control write-free in that case makes it usable as a plain "render
    // this array" field without dirtying the form.
    if (xEvaluate.length === 0 && !persistSheet) return

    let cancelled = false

    // Readonly gates PERSISTING only, never computing: a value the user can
    // see but not save beats silently rewriting a stored record or tripping a
    // host's autosave. `canEdit` already covers the whole-form flag —
    // @jsonforms/core's isInherentlyReadonly returns true for it before
    // anything else, so it reaches this control through the `readonly` prop.
    const persist = (next: SpreadsheetValue | undefined) => {
      if (!canEdit) return
      // Both halves are rebuilt on every run, so a reference check would always
      // report a change and mark a saved form dirty the moment it opened.
      if (sameDerivations(value?.derivations, next?.derivations) && sameSheetData(value?.sheet, next?.sheet)) return
      // Recorded before the write so the next render can tell this control's
      // own sheet from one that arrived some other way.
      knownSheet.current = next?.sheet ?? null
      handleChange(path, next)
    }

    // The SAME matrix the preview renders, so a cell the user can see at row 2
    // is the cell =SUM(D2:D4) reads — including after rowHeader's quarter turn.
    const formulaMatrix = matrix ?? []

    if (formulaMatrix.length === 0) {
      // Don't hand an empty matrix to the engine: evaluateExpressions
      // short-circuits that to one #ERROR! per entry, which reads as "your
      // formula is broken" when the truth is the source field is still empty.
      //
      // Clearing to `undefined` rather than to an empty object follows the
      // same rule the rest of the package does (see useClearWhenHidden): a
      // field with nothing in it should be indistinguishable from one that was
      // never touched. Never dirty an already-pristine field just to write it.
      if (value != null) persist(undefined)
      return
    }

    void evaluateExpressions(formulaMatrix, xEvaluate).then((results) => {
      // A source change landing mid-evaluation could otherwise let an older
      // result overwrite a newer one.
      if (cancelled) return

      // Which sheet to store depends on whether this control PRODUCED one.
      //
      // After an upload it did, so it stores the shaped result (or nothing,
      // with persistSheet: false — a fresh upload must not leave the previous
      // upload's sheet behind). When the rows were already in the field —
      // written by an importer, or loaded with a saved record — they are data,
      // not this effect's output, so they are passed through untouched.
      // Reshaping them would rewrite a records sheet as a matrix whenever no
      // header option is set, dirtying a form the moment it opened; dropping
      // them would be worse, since handleChange replaces the whole value.
      //
      // shapeSheet throws on duplicate keys, which here has to land in the
      // error state rather than propagate out of an effect. It runs in this
      // callback rather than the effect body so no setState is synchronous
      // during the effect, which would force a second render pass every run.
      let sheet: SheetData | undefined
      if (localMatrix != null) {
        if (persistSheet) {
          try {
            sheet = shapeSheet(formulaMatrix, { columnHeader, rowHeader })
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to process this sheet.')
            return
          }
        }
      } else {
        sheet = value?.sheet
      }
      setError(null)

      const derivations = buildDerivations(results)
      // Displayed whether or not it can be saved — see `computed` above.
      setComputed({ matrix: formulaMatrix, derivations })
      persist(sheet === undefined ? { derivations } : { sheet, derivations })
    })

    return () => {
      cancelled = true
    }
    // Deliberately not keyed on `value`/`data`/`path`/`handleChange`, which this
    // effect itself writes to; `matrix` is the memoized reference that moves
    // when the rows actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, localMatrix, xEvaluate, canEdit, persistSheet, columnHeader, rowHeader])

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
    setComputed(null)
    knownSheet.current = null
    setError(null)
    setStatus('empty')
    handleChange(path, null)
  }

  const showStoredNote = showSheet && matrix == null && value != null
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
        {
          <Text size="1" color="gray">
            {formatBytes(maxSize)} max · {formatAccept(accept)}
          </Text>
        }
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
      {<input ref={inputRef} type="file" style={{ display: 'none' }} accept={accept} onChange={handleInputChange} />}

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
