// Regenerates inventory-headerless-sample.xlsx for the
// 'spreadsheet-headerless-columns' fixture in dev/fixtures.ts, which
// demonstrates x-spreadsheet.columns with NO header row at all: real data
// starts at row 1, mapped straight to columns[i].id by POSITION —
// columnHeader is absent/false, so nothing is skipped, and there is no
// header text anywhere in this file for anything to (mis)match against.
// Run with: node dev/sample-files/generate-inventory-headerless-sample.cjs
const { utils, writeFile } = require('@e965/xlsx')
const path = require('node:path')

const rows = [
  ['Widget', 'Hardware', 120, 15.5, 1860],
  ['Gadget', 'Hardware', 75, 42, 3150],
  ['Bolt', 'Fasteners', 500, 0.8, 400],
  ['Bracket', 'Fasteners', 200, 3.25, 650],
]

const worksheet = utils.aoa_to_sheet(rows)
const workbook = utils.book_new()
utils.book_append_sheet(workbook, worksheet, 'Inventory (headerless)')

const outPath = path.join(__dirname, 'inventory-headerless-sample.xlsx')
writeFile(workbook, outPath)
console.log(`Wrote ${outPath}`)
