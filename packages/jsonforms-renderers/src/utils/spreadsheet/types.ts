// Shared data contract for the spreadsheet parsing/formula-evaluation utilities.
// Imported by every other file in this folder and re-exported via index.ts.

export type CellValue = string | number | boolean | Date | null

export type Matrix = unknown[][]

export interface ParsedSheet {
  sheetName: string
  matrix: CellValue[][]
  rowCount: number
  colCount: number
}

export interface FormulaConfigEntry {
  label: string
  expression: string
}

export interface FormulaResult {
  label: string
  value: CellValue | null
  error?: string
}

// REF/VALUE/DIV0/NAME/NA/NUM/NULL mirror the Excel error codes the underlying
// library (fast-formula-parser) itself surfaces via its own `FormulaError`
// class; ERROR is our own catch-all for anything that doesn't map cleanly
// (a syntax error, or a wrapped cause we don't otherwise recognize).
export type FormulaErrorCode = 'REF' | 'VALUE' | 'DIV0' | 'NAME' | 'ERROR' | 'NA' | 'NUM' | 'NULL'
