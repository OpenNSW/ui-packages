import { evaluateExpressions } from './expression'
import type { CellValue, FormulaConfigEntry, SpreadsheetValue } from './types'

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
  const derivations = await evaluateExpressions(matrix, formulas)
  return options.persistSheet !== false ? { sheet: matrix, derivations } : { derivations }
}
