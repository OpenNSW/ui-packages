import { useCallback, useMemo, useState } from 'react'
import { Actions, Resolve, type ControlProps, type JsonSchema } from '@jsonforms/core'
import { useJsonForms, withJsonFormsControlProps } from '@jsonforms/react'
import { Callout, Flex, Spinner, Text } from '@radix-ui/themes'
import { CheckCircledIcon, ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons'
import { FileControlView } from './FileControl'
import { getExcelSpec, parseExcelTable, type ExcelSpec } from '../utils/excelTable'

// A file control for `format: "file"` properties that also carry an `x-excel`
// block. It renders the standard FileControl — same upload UX, same storage key
// semantics — and additionally parses the workbook in the browser once the file
// has uploaded, writing the extracted rows into a sibling array field and the
// aggregates into sibling derived fields. Parsing after the upload rather than
// alongside it keeps the two in step: form values are only ever derived from a
// file that is actually stored.
//
// The target array is displayed by the ordinary ArrayControl. Mark it
// `readOnly` in the schema — that suppresses its Add/Remove controls, since the
// rows come from the sheet rather than being typed — and give it a detail
// layout that groups the columns into short rows of three or four:
//
//   { "type": "Control", "scope": "#/properties/sales",
//     "options": { "detail": { "type": "VerticalLayout", "elements": [
//       { "type": "HorizontalLayout", "elements": [ …3 controls… ] },
//       { "type": "HorizontalLayout", "elements": [ …3 controls… ] }
//     ] } } }
//
// Grouping matters: HorizontalLayout gives every element an equal share of the
// width, so putting ten columns on one line squeezes each to a tenth and clips
// the longer values.

// Extensions worth handing to the reader. `.xls` is deliberately included even
// though the reader cannot open legacy workbooks: it fails with "You passed a
// legacy `.xls` file", which reaches the user through the callout below.
// Excluding it would leave a trader staring at an empty list with no
// explanation. Note the reader itself ignores the extension and inspects the
// file, so a mislabelled `.xlsx` still parses.
const PARSEABLE = /\.(xlsx|xlsm|xls)$/i

type ParseStatus =
  | { state: 'idle' }
  | { state: 'parsing' }
  | {
      state: 'parsed'
      rowCount: number
      skippedRows: number
      missingColumns: string[]
      formulaErrors: Record<string, string>
    }
  | { state: 'error'; message: string }

// Replaces the last segment of a JSONForms data path, so a control at
// `sales_file` resolves its sibling to `sales`, and one at
// `section.sales_file` to `section.sales`.
function siblingPath(path: string, field: string): string {
  const cut = path.lastIndexOf('.')
  return cut === -1 ? field : `${path.slice(0, cut)}.${field}`
}

export const ExcelSourceFileControlView = (props: ControlProps) => {
  const ctx = useJsonForms()
  const [status, setStatus] = useState<ParseStatus>({ state: 'idle' })

  const { path, uischema, schema } = props

  const spec = useMemo<ExcelSpec | undefined>(() => {
    const root = ctx.core?.schema
    const scope = uischema?.scope
    // Prefer resolving through the root schema: the props schema can be a
    // narrowed slice when the control sits inside a nested layout.
    const resolved: JsonSchema | undefined = root && scope ? Resolve.schema(root, scope, root) : schema
    return getExcelSpec(resolved)
  }, [ctx.core?.schema, schema, uischema])

  const writeTable = useCallback(
    (rows: Record<string, unknown>[], derived: Record<string, unknown>) => {
      if (!spec) return
      ctx.dispatch?.(Actions.update(siblingPath(path, spec.target), () => rows))
      for (const [field, value] of Object.entries(derived)) {
        ctx.dispatch?.(Actions.update(siblingPath(path, field), () => value))
      }
    },
    [ctx, path, spec],
  )

  const clearTable = useCallback(() => {
    if (!spec) return
    // Derived fields are cleared alongside the rows: leaving a stale total on
    // screen next to an empty table is worse than showing nothing.
    const cleared = Object.fromEntries(Object.keys(spec.derive ?? {}).map((field) => [field, undefined]))
    writeTable([], cleared)
  }, [spec, writeTable])

  const handleFileAccepted = useCallback(
    (file: File) => {
      if (!spec) return

      if (!PARSEABLE.test(file.name)) {
        // The field may accept other formats too (a schema might allow .xml
        // alongside .xlsx). Keep the upload, drop any previously parsed table.
        clearTable()
        setStatus({ state: 'idle' })
        return
      }

      setStatus({ state: 'parsing' })
      void parseExcelTable(file, spec)
        .then((parsed) => {
          writeTable(parsed.rows, parsed.derived)
          setStatus({
            state: 'parsed',
            rowCount: parsed.rows.length,
            skippedRows: parsed.skippedRows,
            missingColumns: parsed.missingColumns,
            formulaErrors: parsed.derivedErrors,
          })
        })
        .catch((error: unknown) => {
          // A parse failure must not block the upload — the file is still
          // wanted as an attachment, and the user can fall back to whatever
          // manual fields the form offers. Clearing guards against a previous
          // file's rows being submitted alongside this one.
          clearTable()
          setStatus({
            state: 'error',
            message: error instanceof Error ? error.message : 'Could not read the uploaded spreadsheet.',
          })
        })
    },
    [clearTable, spec, writeTable],
  )

  const handleFileCleared = useCallback(() => {
    clearTable()
    setStatus({ state: 'idle' })
  }, [clearTable])

  return (
    <Flex direction="column" gap="2">
      <FileControlView {...props} onFileAccepted={handleFileAccepted} onFileCleared={handleFileCleared} />
      <ParseStatusCallout status={status} />
    </Flex>
  )
}

const ParseStatusCallout = ({ status }: { status: ParseStatus }) => {
  if (status.state === 'idle') return null

  if (status.state === 'parsing') {
    return (
      <Callout.Root size="1" color="gray">
        <Callout.Icon>
          <Spinner size="1" />
        </Callout.Icon>
        <Callout.Text>Reading the spreadsheet…</Callout.Text>
      </Callout.Root>
    )
  }

  if (status.state === 'error') {
    return (
      <Callout.Root size="1" color="amber">
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text>
          {status.message} The file has still been attached — you can continue, but no rows will be shown below.
        </Callout.Text>
      </Callout.Root>
    )
  }

  const warnings: string[] = []
  if (status.missingColumns.length > 0) {
    warnings.push(`Columns not found in the sheet: ${status.missingColumns.join(', ')}.`)
  }
  if (status.skippedRows > 0) {
    warnings.push(`${status.skippedRows} incomplete row(s) were skipped.`)
  }
  // A formula that could not be computed is named along with its reason. Left
  // unsaid, an empty total reads as "the sheet contained none" instead of
  // "the calculation failed".
  for (const [field, reason] of Object.entries(status.formulaErrors)) {
    warnings.push(`Could not calculate ${field}: ${reason}.`)
  }

  return (
    <Callout.Root size="1" color={warnings.length > 0 ? 'amber' : 'green'}>
      <Callout.Icon>{warnings.length > 0 ? <InfoCircledIcon /> : <CheckCircledIcon />}</Callout.Icon>
      <Callout.Text>
        Read {status.rowCount} row{status.rowCount === 1 ? '' : 's'} from the spreadsheet.
        {warnings.length > 0 && (
          <>
            {' '}
            <Text weight="medium">{warnings.join(' ')}</Text>
          </>
        )}{' '}
        Please check the rows below before submitting.
      </Callout.Text>
    </Callout.Root>
  )
}

// Bound to a name before export: an anonymous default export leaves Fast
// Refresh unable to identify the component across reloads.
const ExcelSourceFileControl = withJsonFormsControlProps(ExcelSourceFileControlView)

export default ExcelSourceFileControl
