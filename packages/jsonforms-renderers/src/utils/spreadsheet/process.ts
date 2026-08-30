import { evaluateExpressions } from './expression'
import type { CellValue, DerivationResult, FormulaConfigEntry, SpreadsheetValue } from './types'

export interface ProcessMatrixOptions {
  persistSheet?: boolean
}

// Matrix-in, persisted-value-out. Deliberately format-agnostic: doesn't care
// whether the matrix came from an xlsx/csv upload or (in the future) an XML
// one — this is the reusable seam for both.
export async function processMatrix(
  matrix: CellValue[][],
  formulas: FormulaConfigEntry[],
  options: ProcessMatrixOptions = {},
): Promise<SpreadsheetValue> {
  const results = await evaluateExpressions(matrix, formulas)
  // Keyed by id (not an array) — a duplicate/malformed id collides
  // last-write-wins here, where it previously got its own array slot;
  // accepted for simplicity since ids are schema-author-controlled.
  const derivations: Record<string, DerivationResult> = {}
  for (const { id, label, value, error } of results) {
    derivations[id] = error === undefined ? { label, value } : { label, value, error }
  }
  return options.persistSheet !== false ? { sheet: matrix, derivations } : { derivations }
}
