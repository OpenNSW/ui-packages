// Regenerates sales-data-sample.xlsx — a small, generic (industry-agnostic)
// line-item sheet used by three fixtures in dev/fixtures.ts:
// 'computed-control-with-spreadsheet' (ComputedControl reading a spreadsheet
// derivation alongside a plain user-entered field) and the parity pair
// 'sales-upload' / 'xml-spreadsheet'.
//
// These rows must stay identical to sales-data-sample.xml, which is what lets
// that pair demonstrate that an uploaded source and a path source compute the
// same. Change one and you must change the other;
// src/utils/sample-parity.test.ts fails if they drift.
//
// Run with:
//   node dev/sample-files/generate-sales-data-sample.cjs
const { utils, writeFile } = require('@e965/xlsx')
const path = require('node:path')

// x-evaluate: total_quantity = SUM(D2:D4) -> 500 + 300 + 200 = 1000
const rows = [
  ['Date', 'Item', 'Category', 'Quantity'],
  ['01/06/2026', 'Widget A', 'Hardware', 500],
  ['02/06/2026', 'Widget B', 'Hardware', 300],
  ['03/06/2026', 'Widget C', 'Accessories', 200],
]

const worksheet = utils.aoa_to_sheet(rows)
const workbook = utils.book_new()
utils.book_append_sheet(workbook, worksheet, 'Sales Data')

const outPath = path.join(__dirname, 'sales-data-sample.xlsx')
writeFile(workbook, outPath)
console.log(`Wrote ${outPath}`)
