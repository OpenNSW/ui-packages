// Regenerates the 3 sample .xlsx files used by the 'blendsheet' fixture (see
// dev/fixtures.ts) to manually test ComputedControl (x-computed): multiple
// named inputs pulled from different spreadsheet uploads' derivations, a
// default value for an optional upload, and a computed field chained off
// another computed field. Run with:
//   node dev/sample-files/generate-blendsheet-samples.cjs
const { utils, writeFile } = require('@e965/xlsx')
const path = require('node:path')

function writeSheet(rows, sheetName, fileName) {
  const worksheet = utils.aoa_to_sheet(rows)
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, sheetName)
  const outPath = path.join(__dirname, fileName)
  writeFile(workbook, outPath)
  console.log(`Wrote ${outPath}`)
}

// x-evaluate: total_sales_quantity = SUM(I2:I4) -> 9000 + 8000 + 10000 = 27000
writeSheet(
  [
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
    ],
    ['09/06/2026', 'SC201', 'BR03', 'L501', 'INV4101', 'GLENANORE', 'BOP', 270, 9000],
    ['10/06/2026', 'SC201', 'BR03', 'L502', 'INV4102', 'POONAGALA', 'BOPF', 305, 8000],
    ['11/06/2026', 'SC202', 'BR08', 'L503', 'INV4103', 'KENILWORTH', 'OP', 290, 10000],
  ],
  'Sales',
  'blendsheet-sales-sample.xlsx',
)

// x-evaluate: total_import_quantity = SUM(F2:F4) -> 2000 + 1500 + 1500 = 5000
writeSheet(
  [
    ['Date of Import', 'Country of Origin', 'Invoice No', 'Grade', 'Rate per KG', 'Qty in KG'],
    ['05/06/2026', 'Kenya', 'IMP2201', 'BP1', 260, 2000],
    ['06/06/2026', 'Kenya', 'IMP2202', 'PF1', 255, 1500],
    ['07/06/2026', 'India', 'IMP2203', 'BOP', 275, 1500],
  ],
  'Imported Tea',
  'blendsheet-imported-sample.xlsx',
)

// x-evaluate: total_blend_balance_quantity = SUM(F2:F3) -> 1200 + 800 = 2000
// Optional upload ("IF APPLICABLE") — leave this file unuploaded in the dev
// playground to manually verify the `total` field's default-0 fallback.
writeSheet(
  [
    ['Date', 'Balance Type', 'Reference', 'Grade', 'Rate per KG', 'Qty in KG'],
    ['08/06/2026', 'Opening Balance', 'BAL-01', 'BOP', 268, 1200],
    ['09/06/2026', 'Adjustment', 'BAL-02', 'BOPF', 300, 800],
  ],
  'Blend Balances',
  'blendsheet-balances-sample.xlsx',
)
