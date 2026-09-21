// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { utils, writeFile } from '@e965/xlsx'
import { radixRenderers } from './index'

// Exercises ExcelExportControl through a real JsonForms tree, the same
// harness pattern SpreadsheetControl.test.tsx uses — Theme + JsonForms +
// radixRenderers — rather than calling the component directly, since the
// tester's schema-matching is itself part of what's under test.

// jsdom doesn't implement the download machinery @e965/xlsx's writeFile
// drives internally (Blob + anchor click), and there's no reason to exercise
// the real SheetJS write path in a unit test — mocking it the way the plan
// calls for keeps this test about what ExcelExportControl HANDS to xlsx, not
// about xlsx itself.
vi.mock('@e965/xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn((matrix: unknown) => ({ __matrix: matrix })),
    book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function makeSchema(xExcelExport: Record<string, unknown>): JsonSchema {
  return {
    type: 'object',
    properties: {
      rows: { type: 'array', 'x-excel-export': xExcelExport },
    },
  } as unknown as JsonSchema
}

const uischema = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/rows' }],
} as UISchemaElement

function renderControl(schema: JsonSchema, data: Record<string, unknown>) {
  render(
    <Theme>
      <JsonForms schema={schema} uischema={uischema} data={data} renderers={radixRenderers} />
    </Theme>,
  )
}

function downloadButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /download excel/i }) as HTMLButtonElement
}

// The click handler lazy-imports @e965/xlsx (`await import(...)`), so its
// effects land a microtask after fireEvent.click returns — even against an
// already-mocked, already-resolved module, `await` always defers at least one
// tick. Without waiting for it here, an assertion made right after the click
// would race the handler and observe the PREVIOUS test's write instead.
async function clickDownload() {
  fireEvent.click(downloadButton())
  await waitFor(() => expect(writeFile).toHaveBeenCalled())
}

const RECORDS = [
  { id: 'a', qty: 1 },
  { id: 'b', qty: 2 },
]
const MATRIX = [
  ['A', 'B'],
  [1, 2],
  [3, 4],
]
const COLUMNS = [
  { id: 'id', label: 'ID' },
  { id: 'qty', label: 'Quantity' },
]

describe('ExcelExportControl disabled state', () => {
  it('disables the button when there is no data', () => {
    renderControl(makeSchema({}), { rows: undefined })

    expect(downloadButton().disabled).toBe(true)
  })

  it('disables the button when data is an empty array', () => {
    renderControl(makeSchema({}), { rows: [] })

    expect(downloadButton().disabled).toBe(true)
  })

  it('enables the button once a non-empty array is present', () => {
    renderControl(makeSchema({}), { rows: MATRIX })

    expect(downloadButton().disabled).toBe(false)
  })
})

describe('ExcelExportControl writing a workbook', () => {
  it('writes a records sheet flattened to a matrix, sheet name and bookType defaulted', async () => {
    renderControl(makeSchema({}), { rows: RECORDS })

    await clickDownload()

    expect(utils.aoa_to_sheet).toHaveBeenCalledWith([
      ['id', 'qty'],
      ['a', 1],
      ['b', 2],
    ])
    expect(utils.book_append_sheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Sheet1')
    expect(writeFile).toHaveBeenCalledWith(expect.anything(), 'export.xlsx', { bookType: 'xlsx' })
  })

  it('writes a plain matrix through unchanged, columns ignored', async () => {
    renderControl(makeSchema({ columns: COLUMNS }), { rows: MATRIX })

    await clickDownload()

    expect(utils.aoa_to_sheet).toHaveBeenCalledWith(MATRIX)
  })

  it('relabels a records sheet header row from declared columns, id order pinned by columns', async () => {
    renderControl(makeSchema({ columns: COLUMNS }), { rows: RECORDS })

    await clickDownload()

    expect(utils.aoa_to_sheet).toHaveBeenCalledWith([
      ['ID', 'Quantity'],
      ['a', 1],
      ['b', 2],
    ])
  })

  it('respects sheetName and fileName options', async () => {
    renderControl(makeSchema({ sheetName: 'Budget', fileName: 'budget.xlsx' }), { rows: MATRIX })

    await clickDownload()

    expect(utils.book_append_sheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Budget')
    expect(writeFile).toHaveBeenCalledWith(expect.anything(), 'budget.xlsx', { bookType: 'xlsx' })
  })

  it('passes fileType through as bookType and defaults fileName to match its extension', async () => {
    renderControl(makeSchema({ fileType: 'csv' }), { rows: MATRIX })

    await clickDownload()

    expect(writeFile).toHaveBeenCalledWith(expect.anything(), 'export.csv', { bookType: 'csv' })
  })
})

describe('ExcelExportControl config validation', () => {
  it('shows an inline config error instead of a button when columns is not an array', () => {
    renderControl(makeSchema({ columns: 'nope' }), { rows: MATRIX })

    expect(screen.queryByRole('button', { name: /download excel/i })).toBeNull()
    expect(screen.getByText(/Invalid x-excel-export config/)).toBeTruthy()
    expect(screen.getByText(/columns must be an array/)).toBeTruthy()
  })

  it('shows an inline config error when a column entry is missing id/label', () => {
    renderControl(makeSchema({ columns: [{ id: 'a', label: 'A' }, { label: 'no id' }] }), { rows: MATRIX })

    expect(screen.queryByRole('button', { name: /download excel/i })).toBeNull()
    expect(screen.getByText(/columns\[1\] must be a \{ id, label \} object/)).toBeTruthy()
  })

  it('shows an inline config error when columns is declared but empty', () => {
    renderControl(makeSchema({ columns: [] }), { rows: MATRIX })

    expect(screen.getByText(/columns is declared but empty/)).toBeTruthy()
  })
})

describe('ExcelExportControl download failure', () => {
  it('shows an error next to the button instead of an uncaught rejection', async () => {
    vi.mocked(utils.aoa_to_sheet).mockImplementationOnce(() => {
      throw new Error('workbook rejected: too many rows')
    })
    renderControl(makeSchema({}), { rows: RECORDS })

    fireEvent.click(downloadButton())

    await waitFor(() => expect(screen.getByText('workbook rejected: too many rows')).toBeTruthy())
    // The button itself is unaffected — clicking again should be possible,
    // not left permanently disabled by the failed attempt.
    expect(downloadButton().disabled).toBe(false)
  })
})

describe('ExcelExportControl co-located with an editable ArrayControl', () => {
  function makeCoLocatedSchema(): JsonSchema {
    return {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' } } },
          'x-excel-export': { fileName: 'rows.xlsx' },
        },
      },
    } as unknown as JsonSchema
  }
  const coLocatedUischema = {
    type: 'VerticalLayout',
    elements: [
      { type: 'Control', scope: '#/properties/rows' },
      { type: 'Control', scope: '#/properties/rows', options: { editable: true } },
    ],
  } as UISchemaElement

  it('renders the export button for the plain element and ArrayControl for the editable-marked one', () => {
    render(
      <Theme>
        <JsonForms
          schema={makeCoLocatedSchema()}
          uischema={coLocatedUischema}
          data={{ rows: [{ id: 'a' }] }}
          renderers={radixRenderers}
        />
      </Theme>,
    )

    expect(screen.getByRole('button', { name: /download excel/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /add item/i })).toBeTruthy()
  })
})

describe('ExcelExportControl visibility', () => {
  it('renders nothing when a uischema rule hides it', () => {
    const schema = {
      type: 'object',
      properties: {
        rows: { type: 'array', 'x-excel-export': {} },
        hideExport: { type: 'boolean' },
      },
    } as unknown as JsonSchema
    const hiddenUischema = {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/rows',
          rule: { effect: 'HIDE', condition: { scope: '#/properties/hideExport', schema: { const: true } } },
        },
      ],
    } as UISchemaElement

    render(
      <Theme>
        <JsonForms
          schema={schema}
          uischema={hiddenUischema}
          data={{ rows: MATRIX, hideExport: true }}
          renderers={radixRenderers}
        />
      </Theme>,
    )

    expect(screen.queryByRole('button', { name: /download excel/i })).toBeNull()
  })
})
