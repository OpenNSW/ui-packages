import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { recordsToMatrix, selectSheetSource } from './records'
import { parseWorkbookToMatrix, buildDerivations, evaluateExpressions } from './spreadsheet'
import { parseXmlToDocument } from './xml'
import type { CellValue } from './spreadsheet'

// dev/sample-files/sales-data-sample.xlsx and .xml carry the same three sales
// rows on purpose: the playground's 'Sales (Excel upload)' and 'Sales (XML ->
// sourcePath)' fixtures exist to show that an uploaded source and a path
// source render and compute identically, and that demo is worthless if the two
// files quietly drift apart. Nothing else enforces the match — the .xlsx comes
// from a generator script and the .xml is hand-edited — so it is asserted here.
const sampleFile = (name: string) => fileURLToPath(new URL(`../../dev/sample-files/${name}`, import.meta.url))

// readFileSync gives a Node Buffer over a POOLED ArrayBuffer that is usually
// larger than the file, so passing `.buffer` straight through hands the parser
// unrelated trailing bytes. Slice to this file's own view.
function readArrayBuffer(name: string): ArrayBuffer {
  const buffer = readFileSync(sampleFile(name))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

// The x-evaluate config both fixtures share, mirrored from dev/fixtures.ts.
const SALES_EVALUATE = [
  { id: 'total_quantity', label: 'Total Quantity', expression: '=SUM(D2:D4)' },
  { id: 'average_quantity', label: 'Average Quantity', expression: '=ROUND(AVERAGE(D2:D4),2)' },
  { id: 'line_count', label: 'Line Count', expression: '=COUNTA(B2:B4)' },
  { id: 'categories', label: 'Categories', expression: '=TEXTJOIN(", ",TRUE,C2:C4)' },
  { id: 'broken', label: 'Broken Reference (expects #REF!)', expression: '=SUM(Z2:Z4)' },
]

async function xlsxMatrix(): Promise<CellValue[][]> {
  return (await parseWorkbookToMatrix(readArrayBuffer('sales-data-sample.xlsx'))).matrix
}

// The same journey the control makes for a path source: parse, resolve the
// repeated element, classify it, then flatten it for the formula engine.
async function xmlMatrix(): Promise<CellValue[][]> {
  const document = await parseXmlToDocument(readFileSync(sampleFile('sales-data-sample.xml'), 'utf8'), {
    arrayPaths: ['salesData.sale'],
  })
  const sales = (document.salesData as Record<string, unknown>).sale
  const source = selectSheetSource(sales)
  if (source.status !== 'records') throw new Error(`expected records, got ${source.status}`)
  return recordsToMatrix(source.records)
}

describe('the two sales samples stay interchangeable', () => {
  it('normalize to the identical matrix', async () => {
    const fromXlsx = await xlsxMatrix()
    expect(await xmlMatrix()).toEqual(fromXlsx)
    // Spelled out so a drift in either file reports what changed rather than
    // just that two opaque values differ.
    expect(fromXlsx).toEqual([
      ['Date', 'Item', 'Category', 'Quantity'],
      ['01/06/2026', 'Widget A', 'Hardware', 500],
      ['02/06/2026', 'Widget B', 'Hardware', 300],
      ['03/06/2026', 'Widget C', 'Accessories', 200],
    ])
  })

  it('produce identical derivations under the shared x-evaluate config', async () => {
    // The direct test of the claim the fixture pair demonstrates: one A1
    // reference means the same cell whichever source the rows arrived through.
    const [fromXlsx, fromXml] = await Promise.all([xlsxMatrix(), xmlMatrix()])
    const derive = async (matrix: CellValue[][]) => buildDerivations(await evaluateExpressions(matrix, SALES_EVALUATE))

    const derivedFromXlsx = await derive(fromXlsx)
    expect(await derive(fromXml)).toEqual(derivedFromXlsx)
    expect(derivedFromXlsx).toEqual({
      total_quantity: { label: 'Total Quantity', value: 1000 },
      average_quantity: { label: 'Average Quantity', value: 333.33 },
      line_count: { label: 'Line Count', value: 3 },
      categories: { label: 'Categories', value: 'Hardware, Hardware, Accessories' },
      // One entry failing must not blank the others.
      broken: { label: 'Broken Reference (expects #REF!)', value: null, error: '#REF!' },
    })
  })
})
