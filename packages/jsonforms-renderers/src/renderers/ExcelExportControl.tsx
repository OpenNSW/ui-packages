import { withJsonFormsControlProps } from '@jsonforms/react'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Button, Text } from '@radix-ui/themes'
import { DownloadIcon } from '@radix-ui/react-icons'
import { isRecordsSheet, type CellValue, type SheetData, type SpreadsheetFieldSpec } from '../utils/spreadsheet'
import { recordsToMatrix } from '../utils/records'

// Narrowed to the four ordinary spreadsheet interchange formats worth
// exposing today. @e965/xlsx's own BookType union covers many more (xlsm,
// xlsb, html, dbf, ...) — widening this is a one-line type change plus an
// options-table update, since writeFile already forwards whatever bookType
// it's given (see the "Behavior" note in docs/excel-export-control.md).
export type ExcelExportFileType = 'xlsx' | 'xls' | 'csv' | 'ods'

interface XExcelExportOptions {
  /**
   * Declared column id/label list, in order — same shape as
   * x-spreadsheet.columns. `id` pins column identity/order. Only meaningful
   * on the records path (see isRecordsSheet in toMatrix below): it seeds
   * recordsToMatrix's header and then relabels that header row for display.
   * Omitted → falls back to the union of every record's own keys, first-seen
   * order (the same rule recordsToMatrix already applies). Ignored entirely
   * on the matrix path — there's no header row there to relabel.
   */
  columns?: SpreadsheetFieldSpec[]
  /** Worksheet name. Ignored when fileType is a non-sheeted format (e.g. csv). */
  sheetName?: string
  /** Output format, passed straight through as @e965/xlsx's own `bookType`. */
  fileType?: ExcelExportFileType
  /** Downloaded file's name. Defaults to `export.${fileType}`, so the two never mismatch. */
  fileName?: string
}

type ExcelExportControlProps = ControlProps & {
  schema: JsonSchema & { 'x-excel-export'?: XExcelExportOptions }
}

const DEFAULT_SHEET_NAME = 'Sheet1'
const DEFAULT_FILE_TYPE: ExcelExportFileType = 'xlsx'

// Builds the matrix @e965/xlsx's aoa_to_sheet expects from whichever shape
// SpreadsheetControl itself would persist at this same scope — told apart the
// same way SpreadsheetControl's own asMatrix does, with isRecordsSheet.
//
// Records: flattened with recordsToMatrix, the same helper SpreadsheetControl
// uses, seeded with the declared column ids so identity/order matches the
// schema author's config rather than whatever order the records happen to
// carry. When columns also declares labels, the header row (ids only, from
// recordsToMatrix) is swapped for the matching label — display-only, exactly
// SpreadsheetControl's own label/id split (see docs/spreadsheet-value-shape.md)
// — with any extra key recordsToMatrix appended (not in the declared list)
// falling back to its own id as the header text.
//
// Matrix: already rectangular and ready for aoa_to_sheet as-is — written
// through unchanged. columns has no header row to relabel here and is ignored.
function toMatrix(data: SheetData, columns: SpreadsheetFieldSpec[] | undefined): CellValue[][] {
  if (!isRecordsSheet(data)) return data

  const matrix = recordsToMatrix(
    data,
    columns?.map((c) => c.id),
  )
  if (!columns || matrix.length === 0) return matrix

  const labelById = new Map(columns.map((c) => [c.id, c.label]))
  const [header, ...rows] = matrix
  return [header.map((id) => labelById.get(String(id)) ?? id), ...rows]
}

const ExcelExportControl = ({ data, label, schema, visible = true }: ExcelExportControlProps) => {
  if (visible === false) {
    return null
  }

  const xExcelExport: XExcelExportOptions = schema?.['x-excel-export'] ?? {}
  const columns = xExcelExport.columns
  const sheetName = xExcelExport.sheetName ?? DEFAULT_SHEET_NAME
  const fileType = xExcelExport.fileType ?? DEFAULT_FILE_TYPE
  const fileName = xExcelExport.fileName ?? `export.${fileType}`

  const hasValue = Array.isArray(data) && data.length > 0

  // Lazy-imported, the same on-demand pattern utils/spreadsheet/parse.ts
  // already uses for `read`/`utils` (see commit 82762cc): a static import
  // here would put SheetJS in the initial payload of every app that pulls in
  // radixRenderers, including ones whose forms never export anything.
  //
  // Deliberately the generic writeFile (which accepts any bookType), not the
  // xlsx-only writeFileXLSX shortcut — that's what makes widening
  // ExcelExportFileType to more of BookType later a config change rather than
  // a rewrite. writeFile triggers the browser download itself (Blob + anchor
  // internally), so no separate download utility is needed here.
  const handleDownload = async () => {
    if (!hasValue) return
    const XLSX = await import('@e965/xlsx')
    const matrix = toMatrix(data as SheetData, columns)
    const worksheet = XLSX.utils.aoa_to_sheet(matrix)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    XLSX.writeFile(workbook, fileName, { bookType: fileType })
  }

  return (
    <Box mb="4">
      <Text as="label" size="2" weight="bold" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
        {label}
      </Text>
      <Button type="button" variant="soft" disabled={!hasValue} onClick={() => void handleDownload()}>
        <DownloadIcon /> Download Excel
      </Button>
    </Box>
  )
}

export default withJsonFormsControlProps(ExcelExportControl)
