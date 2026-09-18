// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import { shapeSheet } from '../utils/spreadsheet'

// Exercises SpreadsheetControl through a real JsonForms tree rather than by
// calling it directly, because the behaviour under test is precisely its
// interaction with the store: what it does with the sheet in its own field,
// and what it writes back.

type Data = Record<string, unknown>

// Each render gets its OWN collector, deliberately not a module-level array.
// A tree from a finished test can still deliver one last onChange, and with a
// shared array that write lands in whichever test is running next — which
// reads exactly like the control dirtying a form it should have left alone.
// `live` is flipped on teardown so a late write is dropped rather than
// misattributed to the next test.
const finishers: (() => void)[] = []

afterEach(() => {
  for (const stop of finishers) stop()
  finishers.length = 0
  cleanup()
})

const uischema = {
  type: 'VerticalLayout',
  elements: [{ type: 'Control', scope: '#/properties/totals' }],
} as UISchemaElement

// The `data` prop is a SEED, deliberately not fed back from onChange. Rewiring
// it as a round trip makes JsonForms replace its internal state on every change
// and silently drop effect-driven writes — the exact hazard
// docs/spreadsheet-value-shape.md warns hosts about.
function Harness({
  schema,
  seed,
  onData,
  readonly,
}: {
  schema: JsonSchema
  seed: Data
  onData: (data: Data) => void
  readonly?: boolean
}) {
  const [initial] = useState(seed)
  // Wrapped in Theme exactly as a consuming app is: the upload header's
  // replace/remove buttons are Radix Tooltips, which throw without its
  // provider.
  return (
    <Theme>
      <JsonForms
        schema={schema}
        uischema={uischema}
        data={initial}
        renderers={radixRenderers}
        readonly={readonly}
        onChange={({ data }) => onData(data as Data)}
      />
    </Theme>
  )
}

function renderForm(schema: JsonSchema, seed: Data, readonly = false) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })
  render(
    <Harness
      schema={schema}
      seed={seed}
      readonly={readonly}
      onData={(data) => {
        if (live) writes.push(data)
      }}
    />,
  )
  return {
    writes,
    totals: () => writes[writes.length - 1]?.totals as Record<string, unknown> | undefined,
    neverWroteTotals: () => writes.every((w) => w.totals === undefined),
  }
}

// Renders with a data prop the test can swap, which is how an external write
// reaches the control: JsonForms replaces its internal state when `data`
// changes, exactly as it does when something dispatches into this field.
function renderSwappable(schema: JsonSchema, seed: Data, readonly = false) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })
  function Harness({ data }: { data: Data }) {
    return (
      <Theme>
        <JsonForms
          schema={schema}
          uischema={uischema}
          data={data}
          renderers={radixRenderers}
          readonly={readonly}
          onChange={({ data }) => {
            if (live) writes.push(data as Data)
          }}
        />
      </Theme>
    )
  }
  const view = render(<Harness data={seed} />)
  return {
    writes,
    totals: () => writes[writes.length - 1]?.totals as Record<string, unknown> | undefined,
    rerender: (next: Data) => view.rerender(<Harness data={next} />),
  }
}

// Drives a real upload, which is the only thing that populates the local
// preview the test below is about. CSV because the parser reads it from the
// same ArrayBuffer path an .xlsx takes, without needing a binary fixture.
function uploadCsv(csv: string) {
  const input = document.querySelector('input[type=file]')
  if (!input) throw new Error('no file input')
  fireEvent.change(input, { target: { files: [new File([csv], 'sheet.csv', { type: 'text/csv' })] } })
}

// Four data rows, so it is distinguishable from both records fixtures at a
// glance, and a total of its own.
const UPLOADED_CSV = 'Item,Qty\nA,1\nB,2\nC,3\nD,4\n'

const SUM_B2_B3 = [{ id: 'total', label: 'Total', expression: '=SUM(B2:B3)' }]

function makeSchema(spreadsheet: Record<string, unknown>, evaluate: unknown[] = SUM_B2_B3): JsonSchema {
  return {
    type: 'object',
    properties: {
      rows: { type: 'array' },
      totals: {
        type: 'object',
        title: 'Totals',
        'x-spreadsheet': spreadsheet,
        'x-evaluate': evaluate,
        properties: { sheet: { type: 'array' }, derivations: { type: 'object' } },
      },
    },
  } as unknown as JsonSchema
}

// The declared field list every columnHeader-mode test below needs — ids
// happen to equal the display labels, so a formatted grid cell reads the
// same either way and existing assertions don't have to distinguish them.
const ITEM_QTY_COLUMNS = [
  { id: 'Item', label: 'Item' },
  { id: 'Qty', label: 'Qty' },
]

// Flattens to [['Item','Qty'],['Widget',10],['Gadget',20]], so B2:B3 is the Qty
// column of the two data rows and SUM is 30.
const RECORDS = [
  { Item: 'Widget', Qty: 10 },
  { Item: 'Gadget', Qty: 20 },
]
const MATRIX = [
  ['Item', 'Qty'],
  ['Widget', 10],
  ['Gadget', 20],
]
const DERIVED = { total: { label: 'Total', value: 30 } }
// Different in BOTH row count and total. The quantities that move are the ones
// inside B2:B3 — changing only a row outside the range would leave the total at
// 30 and make the assertion below prove nothing.
const OTHER_RECORDS = [
  { Item: 'Widget', Qty: 100 },
  { Item: 'Gadget', Qty: 200 },
  { Item: 'Sprocket', Qty: 70 },
]
const OTHER_DERIVED = { total: { label: 'Total', value: 300 } }

// A sheet already sitting in the field — written there by an importer, or
// loaded with a saved record. The control never parsed it, so it is data rather
// than something this control produced.
const written = (sheet: unknown, derivations?: unknown) => ({
  totals: derivations === undefined ? { sheet } : { sheet, derivations },
})

describe('SpreadsheetControl evaluating a sheet written into its own field', () => {
  it('computes derivations for rows it never parsed itself', async () => {
    const { totals } = renderForm(makeSchema({ columnHeader: true, columns: ITEM_QTY_COLUMNS }), written(RECORDS))

    await waitFor(() => expect(totals()?.derivations).toEqual(DERIVED))
  })

  it('leaves the written rows exactly as they were found', async () => {
    // Reshaping them would rewrite a records sheet as a matrix whenever no
    // header option is set — a silent edit to someone else's data.
    const { totals } = renderForm(makeSchema({}), written(RECORDS))

    await waitFor(() => expect(totals()?.derivations).toEqual(DERIVED))
    expect(totals()?.sheet).toEqual(RECORDS)
  })

  it('leaves an already-correct value alone, so opening a saved form does not dirty it', async () => {
    // Reference identity is the precise tell: a write runs buildDerivations,
    // which always returns a NEW object. Deep equality would pass either way,
    // since the recomputed numbers are the same ones already stored.
    const { writes } = renderForm(
      makeSchema({ columnHeader: true, columns: ITEM_QTY_COLUMNS }),
      written(RECORDS, DERIVED),
    )

    await new Promise((r) => setTimeout(r, 80))
    const derivationsOf = (w: Data) => (w.totals as { derivations?: unknown } | undefined)?.derivations
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.every((w) => derivationsOf(w) === DERIVED)).toBe(true)
  })

  it('writes nothing at all with no x-evaluate and nothing to store', async () => {
    const { neverWroteTotals } = renderForm(makeSchema({ persistSheet: false }, []), { totals: undefined })

    await new Promise((r) => setTimeout(r, 50))
    expect(neverWroteTotals()).toBe(true)
  })

  it('addresses a written 2-D sheet literally, as an uploaded one is', async () => {
    const { totals } = renderForm(makeSchema({}), written(MATRIX))

    await waitFor(() => expect(totals()?.derivations).toEqual(DERIVED))
  })
})

describe('SpreadsheetControl when something else replaces its sheet', () => {
  // A file the user uploaded is previewed from local state, because with
  // persistSheet: false there is nowhere else for it to live. That preview used
  // to win forever — removal was the only thing that cleared it — so rows
  // written into the field afterwards were stored but neither rendered nor
  // evaluated, leaving the form computing from one sheet while holding another.
  it('drops a previewed upload once a different sheet lands in the field', async () => {
    const { rerender, totals } = renderSwappable(makeSchema({}), written(RECORDS, DERIVED))

    // The upload is what creates the local preview. Without it there is no
    // precedence to get wrong, and this test would pass either way.
    uploadCsv(UPLOADED_CSV)
    await waitFor(() => expect(grid()?.rows.length).toBe(5))

    // Stand-in for an importer writing rows straight into the field.
    rerender(written(OTHER_RECORDS))

    // The written rows must win: previously the upload did, forever, so these
    // rows were stored but neither rendered nor evaluated.
    await waitFor(() => expect(grid()?.rows.length).toBe(4))
    await waitFor(() => expect(totals()?.derivations).toEqual(OTHER_DERIVED))
  })
})

describe('SpreadsheetControl configuration errors', () => {
  it('rejects columnHeader and rowHeader together instead of picking a winner', async () => {
    renderForm(makeSchema({ columnHeader: true, rowHeader: true }), written(RECORDS))

    expect(await screen.findByText(/columnHeader and rowHeader cannot both be true/)).toBeTruthy()
    expect(screen.queryByText('30')).toBeNull()
  })

  it('rejects columnHeader: true with columns missing, as a configuration error', async () => {
    renderForm(makeSchema({ columnHeader: true }), written(RECORDS))

    expect(await screen.findByText(/columns is missing or empty/)).toBeTruthy()
    expect(screen.queryByText('30')).toBeNull()
  })

  // matrix/asMatrix still fall back to SOME shape for a misconfigured field
  // (e.g. first-seen-key order), so the config error must stop evaluation and
  // persistence outright — not just what's rendered — or this could silently
  // write derivations computed from that fallback shape while showing nothing
  // but the error box.
  it('never evaluates or persists anything while the config is invalid', async () => {
    const { writes } = renderForm(makeSchema({ columnHeader: true }), written(RECORDS))

    await screen.findByText(/columns is missing or empty/)
    await new Promise((r) => setTimeout(r, 80))

    const derivationsOf = (w: Data) => (w.totals as { derivations?: unknown } | undefined)?.derivations
    expect(writes.every((w) => derivationsOf(w) === undefined)).toBe(true)
  })

  it('rejects rowHeader: true with rows missing, as a configuration error', async () => {
    renderForm(makeSchema({ rowHeader: true }), written(RECORDS))

    expect(await screen.findByText(/rows is missing or empty/)).toBeTruthy()
  })

  it('rejects columns and rows both declared', async () => {
    renderForm(makeSchema({ columns: ITEM_QTY_COLUMNS, rows: [{ id: 'x', label: 'X' }] }), written(RECORDS))

    expect(await screen.findByText(/cannot both be declared/)).toBeTruthy()
  })

  // A schema author's `columns: "Qty"` (a plain string, not an array) must
  // render this same config-error box, never throw during render — a bad
  // schema string would otherwise be iterated as individual characters by
  // anything downstream that assumes an array.
  it('rejects columns given as a plain string instead of an array, without throwing', async () => {
    expect(() => renderForm(makeSchema({ columnHeader: true, columns: 'Qty' }), written(RECORDS))).not.toThrow()

    expect(await screen.findByText(/columns must be an array/)).toBeTruthy()
  })
})

function uploadSchema(spreadsheet: Record<string, unknown>): JsonSchema {
  return makeSchema(spreadsheet, [])
}

// The rendered grid, as the row-header column plus each row's cells.
const grid = () => {
  const table = document.querySelector('table')
  if (!table) return null
  return {
    head: [...table.querySelectorAll('thead th')].map((c) => c.textContent),
    rows: [...table.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent)),
  }
}

describe('SpreadsheetControl when it may not save', () => {
  it('stops showing a total once the sheet it was computed from is gone', async () => {
    // Evaluation is async, and some paths never finish it: an empty matrix
    // short-circuits before the engine is called. A total kept without
    // remembering WHICH sheet produced it therefore outlives that sheet — on
    // that path, indefinitely.
    //
    // Readonly so the empty sheet STAYS in the field: when the control may
    // write, it clears the field instead, which makes the matrix null and hides
    // the staleness behind a different code path.
    const { rerender } = renderSwappable(makeSchema({}), written(RECORDS), true)

    await waitFor(() => expect(screen.queryByText('30')).toBeTruthy())

    rerender(written([]))

    await waitFor(() => expect(screen.queryByText('30')).toBeNull())
  })

  it('still shows computed values it is not allowed to persist', async () => {
    // Readonly gates PERSISTING, never computing. Without somewhere to put the
    // result, the effect recomputed the right numbers and threw them away, so a
    // readonly field showed stale derivations — or none.
    const { writes } = renderForm(makeSchema({ columnHeader: true, columns: ITEM_QTY_COLUMNS }), written(RECORDS), true)

    await waitFor(() => expect(screen.queryByText('30')).toBeTruthy())
    // …and wrote nothing while doing it.
    expect(writes.every((w) => (w.totals as { derivations?: unknown })?.derivations === undefined)).toBe(true)
  })
})

describe('SpreadsheetControl renders one grid whatever shape the data is in', () => {
  it('reloads a columnHeader sheet exactly as the fresh upload rendered it', async () => {
    // Fresh upload and reload used to take different preview branches, so the
    // same sheet rendered two different ways depending on whether the page had
    // been refreshed. Both now flatten to the same matrix.
    renderForm(uploadSchema({ columnHeader: true, columns: ITEM_QTY_COLUMNS }), {
      totals: { sheet: RECORDS, derivations: {} },
    })

    await waitFor(() => expect(grid()).toBeTruthy())
    expect(grid()).toEqual({
      head: ['', 'Item', 'Qty'],
      // No 1/2/3 fallback: with real column labels above, a row number would
      // not be a real label either.
      rows: [
        ['', 'Widget', '10'],
        ['', 'Gadget', '20'],
      ],
    })
  })

  it('numbers rows to match what the formulas address', async () => {
    // With no header option the grid is addressed literally, so the row shown
    // as 1 must be the row =SUM(B1:B1) reads — here the flattened field-name
    // row, with the data starting at 2.
    renderForm(uploadSchema({}), { totals: { sheet: RECORDS, derivations: {} } })

    await waitFor(() => expect(grid()).toBeTruthy())
    expect(grid()).toEqual({
      head: ['', 'A', 'B'],
      rows: [
        ['1', 'Item', 'Qty'],
        ['2', 'Widget', '10'],
        ['3', 'Gadget', '20'],
      ],
    })
  })

  it('reloads a rowHeader sheet with its labels still down column A', async () => {
    // shapeSheet's rowHeader branch builds one record per original COLUMN, so
    // reading it back needs the quarter turn or the labels come out along row 1.
    // Row 0 of MATRIX is skipped unread (rowHeader: true) — its former text
    // ('Item'/'Widget'/'Gadget') no longer comes FROM the file; it's declared
    // here instead, one field per MATRIX row.
    const rows = [
      { id: 'item', label: 'Item' },
      { id: 'widget', label: 'Widget' },
      { id: 'gadget', label: 'Gadget' },
    ]
    const persisted = shapeSheet(MATRIX, { rowHeader: true, rows })
    renderForm(uploadSchema({ rowHeader: true, rows }), { totals: { sheet: persisted, derivations: {} } })

    await waitFor(() => expect(grid()).toBeTruthy())
    expect(grid()).toEqual({
      // rowHeader alone suppresses the column-header row: every cell in it
      // would be blank.
      head: [],
      rows: [
        ['Item', 'Qty'],
        ['Widget', '10'],
        ['Gadget', '20'],
      ],
    })
  })
})

describe('SpreadsheetControl shaping a FRESH upload into records', () => {
  it('shapes a fresh upload into records immediately, keyed by declared columns', async () => {
    // Row 1 of this file is decorative/wrong-looking on purpose — it must be
    // discarded unread (columnHeader: true), never matched against `columns`.
    const { totals } = renderForm(uploadSchema({ columnHeader: true, columns: ITEM_QTY_COLUMNS }), {
      totals: undefined,
    })

    uploadCsv('X,Y\nWidget,10\nGadget,20\n')

    await waitFor(() => expect(grid()).toBeTruthy())
    expect(grid()).toEqual({
      head: ['', 'Item', 'Qty'],
      rows: [
        ['', 'Widget', '10'],
        ['', 'Gadget', '20'],
      ],
    })
    await waitFor(() =>
      expect(totals()?.sheet).toEqual([
        { Item: 'Widget', Qty: 10 },
        { Item: 'Gadget', Qty: 20 },
      ]),
    )
  })

  it('shapes a FRESH upload with no header row at all when columnHeader is false (headerless positional mode)', async () => {
    const { totals } = renderForm(uploadSchema({ columns: ITEM_QTY_COLUMNS }), { totals: undefined })

    // No decorative row here — the very first line is real data.
    uploadCsv('Widget,10\nGadget,20\n')

    await waitFor(() => expect(grid()).toBeTruthy())
    expect(grid()).toEqual({
      head: ['', 'Item', 'Qty'],
      rows: [
        ['', 'Widget', '10'],
        ['', 'Gadget', '20'],
      ],
    })
    await waitFor(() =>
      expect(totals()?.sheet).toEqual([
        { Item: 'Widget', Qty: 10 },
        { Item: 'Gadget', Qty: 20 },
      ]),
    )
  })
})
