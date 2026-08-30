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
  id: string
  label: string
  expression: string
}

export interface FormulaResult {
  id: string
  label: string
  value: CellValue | null
  error?: string
}

// REF/VALUE/DIV0/NAME/NA/NUM/NULL mirror the Excel error codes the underlying
// library (fast-formula-parser) itself surfaces via its own `FormulaError`
// class; ERROR is our own catch-all for anything that doesn't map cleanly
// (a syntax error, or a wrapped cause we don't otherwise recognize).
export type FormulaErrorCode = 'REF' | 'VALUE' | 'DIV0' | 'NAME' | 'ERROR' | 'NA' | 'NUM' | 'NULL'

// One x-evaluate entry's persisted result, without its id — the id is the
// map key in SpreadsheetValue.derivations below, not duplicated in the value.
export interface DerivationResult {
  label: string
  value: CellValue | null
  error?: string
}

// Persisted value shape for SpreadsheetControl — the field's data is an
// object, not a string key. No `fileName`: there's no storage service to
// name a retrievable file for. `derivations` is keyed by each x-evaluate
// entry's mandatory id (not an array) so a sibling field can address one
// specific derivation's value directly via a plain data-tree path (e.g.
// `sales.derivations.total_sales.value`), with no "find by id" step needed
// anywhere. Shared here (rather than kept private to SpreadsheetControl.tsx)
// so sibling renderers, like ComputedControl, can read it with the same type.
export interface SpreadsheetValue {
  sheet?: CellValue[][]
  derivations: Record<string, DerivationResult>
}
