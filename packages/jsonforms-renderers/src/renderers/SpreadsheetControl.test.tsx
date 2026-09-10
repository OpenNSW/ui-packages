// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'

// Exercises SpreadsheetControl through a real JsonForms tree rather than by
// calling it directly, because the behaviour under test is precisely its
// interaction with the store: what it resolves from a sibling path, and what it
// writes back.

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
function Harness({ schema, seed, onData }: { schema: JsonSchema; seed: Data; onData: (data: Data) => void }) {
  const [initial] = useState(seed)
  return (
    <JsonForms
      schema={schema}
      uischema={uischema}
      data={initial}
      renderers={radixRenderers}
      onChange={({ data }) => onData(data as Data)}
    />
  )
}

function renderForm(schema: JsonSchema, seed: Data) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })
  render(
    <Harness
      schema={schema}
      seed={seed}
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

describe('SpreadsheetControl reading from a path', () => {
  it('computes derivations from a sibling array and persists only those by default', async () => {
    const { totals } = renderForm(makeSchema({ sourcePath: 'rows', columnHeader: true }), { rows: RECORDS })

    await waitFor(() => expect(totals()).toEqual({ derivations: DERIVED }))
    // The rows already live under `rows` in the same submission, so persisting
    // them again here would just write a second copy.
    expect(totals()).not.toHaveProperty('sheet')
    expect(screen.getByText('30')).toBeTruthy()
  })

  it('persists a shaped sheet as well when persistSheet is set', async () => {
    const { totals } = renderForm(makeSchema({ sourcePath: 'rows', columnHeader: true, persistSheet: true }), {
      rows: RECORDS,
    })

    // columnHeader shapes the persisted value exactly as it does for an upload
    // — the point of the option not caring where the rows came from.
    await waitFor(() => expect(totals()).toEqual({ sheet: RECORDS, derivations: DERIVED }))
  })

  it('persists the raw matrix when persistSheet is set with no header option', async () => {
    const { totals } = renderForm(makeSchema({ sourcePath: 'rows', persistSheet: true }), { rows: RECORDS })

    await waitFor(() => expect(totals()).toEqual({ sheet: MATRIX, derivations: DERIVED }))
  })

  it('leaves an already-correct value alone, so opening a saved form does not dirty it', async () => {
    const { writes } = renderForm(makeSchema({ sourcePath: 'rows', columnHeader: true, persistSheet: true }), {
      rows: RECORDS,
      totals: { sheet: RECORDS, derivations: DERIVED },
    })

    await waitFor(() => expect(screen.getByText('30')).toBeTruthy())
    // Both halves are rebuilt on every run, so without sameDerivations and
    // sameSheetData guarding the write this would rewrite an identical value
    // and mark the form dirty on mount.
    for (const write of writes) {
      expect(write.totals).toEqual({ sheet: RECORDS, derivations: DERIVED })
    }
  })

  it('writes nothing at all with neither x-evaluate nor persistSheet', async () => {
    const { neverWroteTotals } = renderForm(makeSchema({ sourcePath: 'rows' }, []), { rows: RECORDS })

    // A display-only field must not be able to dirty a form.
    await waitFor(() => expect(screen.getByText('Widget')).toBeTruthy())
    expect(neverWroteTotals()).toBe(true)
  })

  it('stays pristine and says so when the path resolves to nothing', async () => {
    const { neverWroteTotals } = renderForm(makeSchema({ sourcePath: 'rows' }), {})

    expect(await screen.findByText('No data available yet.')).toBeTruthy()
    // An upstream field the user has not filled in yet is the normal case, not
    // an error, so rendering alone must not dirty the field.
    expect(neverWroteTotals()).toBe(true)
  })

  it('reports a path that does not point at rows, naming the path', async () => {
    renderForm(makeSchema({ sourcePath: 'rows' }), { rows: 'not rows' })

    expect(await screen.findByText(/sourcePath "rows" doesn't point at rows or records/)).toBeTruthy()
  })

  it('renders a 2-D source through the same preview an uploaded sheet uses', async () => {
    renderForm(makeSchema({ sourcePath: 'rows' }, []), { rows: MATRIX })

    // A 2-D source is addressed literally, so with no columnHeader the headings
    // are column letters and the sheet's own first row stays a data row.
    expect(await screen.findByText('A')).toBeTruthy()
    expect(screen.getByText('Item')).toBeTruthy()
  })
})

describe('SpreadsheetControl configuration errors', () => {
  it('rejects columnHeader and rowHeader together instead of picking a winner', async () => {
    renderForm(makeSchema({ sourcePath: 'rows', columnHeader: true, rowHeader: true }), { rows: RECORDS })

    expect(await screen.findByText(/columnHeader and rowHeader cannot both be true/)).toBeTruthy()
    expect(screen.queryByText('30')).toBeNull()
  })
})
