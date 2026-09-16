// Regenerates inventory-shuffled-sample.xlsx for the 'spreadsheet-pinned-columns'
// fixture in dev/fixtures.ts, which demonstrates x-spreadsheet.columns.
//
// The canonical field order that fixture's x-evaluate formulas and
// x-spreadsheet.columns both assume is: Item, Category, Quantity, Unit Cost,
// Total Cost (A-E). This file deliberately has the SAME rows but a DIFFERENT
// column order (reversed) — normal x-spreadsheet.columnHeader keys each
// record by row 1's labels in whatever order row 1 has them, so without
// `columns` a formula addressing a fixed column letter (e.g. SUM(C2:C5) for
// Quantity) would silently sum the wrong field. `columns` re-normalizes the
// header to the declared order regardless of the upload's own arrangement.
// Run with: node dev/sample-files/generate-inventory-shuffled-sample.cjs
const { utils, writeFile } = require('@e965/xlsx')
const path = require('node:path')

const rows = [
  ['Total Cost', 'Unit Cost', 'Quantity', 'Category', 'Item'],
  [1860, 15.5, 120, 'Hardware', 'Widget'],
  [3150, 42, 75, 'Hardware', 'Gadget'],
  [400, 0.8, 500, 'Fasteners', 'Bolt'],
  [650, 3.25, 200, 'Fasteners', 'Bracket'],
]

const worksheet = utils.aoa_to_sheet(rows)
const workbook = utils.book_new()
utils.book_append_sheet(workbook, worksheet, 'Inventory (shuffled)')

const outPath = path.join(__dirname, 'inventory-shuffled-sample.xlsx')
writeFile(workbook, outPath)
console.log(`Wrote ${outPath}`)
