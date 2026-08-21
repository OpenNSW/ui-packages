// Regenerates spreadsheet-sample.xlsx — a small, realistic tea-auction report
// used to manually test the SpreadsheetControl's upload/preview/x-evaluate
// flow in the dev playground (see the 'spreadsheet' fixture in dev/fixtures.ts).
// Run with: node dev/sample-files/generate-spreadsheet-sample.cjs
const { utils, writeFile } = require('@e965/xlsx')
const path = require('node:path')

const rows = [
  [
    'Date of Sale',
    'Sale Code',
    'BR Code',
    'Lot No',
    'Inv No',
    'Garden Mark',
    'Grade',
    'Rate per KG',
    'Qty in KG',
    'Total Value Rs',
  ],
  ['09/06/2026', 'SC101', 'BR07', 'L245', 'INV3301', 'GLENANORE', 'BOP', 265.5, 8000, 2124000],
  ['09/06/2026', 'SC101', 'BR12', 'L118', 'INV3302', 'POONAGALA', 'BOPF', 310, 5000, 1550000],
  ['10/06/2026', 'SC102', 'BR07', 'L332', 'INV3305', 'KENILWORTH', 'OP', 288.75, 6200, 1790250],
  ['10/06/2026', 'SC102', 'BR19', 'L090', 'INV3309', 'DIMBULA VALLEY', 'BOP', 265.5, 4300, 1141650],
  ['11/06/2026', 'SC103', 'BR12', 'L410', 'INV3315', 'GLENANORE', 'PEKOE', 245, 3500, 857500],
]

const worksheet = utils.aoa_to_sheet(rows)
const workbook = utils.book_new()
utils.book_append_sheet(workbook, worksheet, 'Auction Report')

const outPath = path.join(__dirname, 'spreadsheet-sample.xlsx')
writeFile(workbook, outPath)
console.log(`Wrote ${outPath}`)
