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

// Persisted value shape for SpreadsheetControl — the field's data is an
// object, not a string key. No `fileName`: there's no storage service to
// name a retrievable file for. Shared here (rather than kept private to
// SpreadsheetControl.tsx) so sibling renderers, like ComputedControl, can
// read a SpreadsheetControl's persisted `derivations` with the same type.
export interface SpreadsheetValue {
  sheet?: CellValue[][]
  derivations: FormulaResult[]
}
