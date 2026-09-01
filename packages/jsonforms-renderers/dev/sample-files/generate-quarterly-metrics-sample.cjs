// Regenerates quarterly-metrics-sample.xlsx — a small, generic
// (industry-agnostic) "wide" metrics table used to manually test
// SpreadsheetControl's rowHeader: true (transposed records) shaping in the
// dev playground (see the 'spreadsheet-row-header' fixture in
// dev/fixtures.ts). Column A holds each metric's name; every OTHER column
// (one per quarter) becomes one persisted record when shaped. Run with:
//   node dev/sample-files/generate-quarterly-metrics-sample.cjs
const { utils, writeFile } = require('@e965/xlsx')
const path = require('node:path')

// x-evaluate: total_units_sold = SUM(B2:D2) -> 120 + 150 + 200 = 470
const rows = [
  ['Metric', 'Q1', 'Q2', 'Q3'],
  ['Units Sold', 120, 150, 200],
  ['Returns', 5, 8, 6],
  ['Net Units', 115, 142, 194],
]

const worksheet = utils.aoa_to_sheet(rows)
const workbook = utils.book_new()
utils.book_append_sheet(workbook, worksheet, 'Quarterly Metrics')

const outPath = path.join(__dirname, 'quarterly-metrics-sample.xlsx')
writeFile(workbook, outPath)
console.log(`Wrote ${outPath}`)
