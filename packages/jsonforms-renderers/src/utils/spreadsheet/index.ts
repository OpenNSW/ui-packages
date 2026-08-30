export { parseWorkbookToMatrix, columnLetter, SheetParseError } from './parse'
export { evaluateExpression, evaluateExpressions, describeFormulaError } from './expression'
export { processMatrix } from './process'
export type { ProcessMatrixOptions } from './process'
export type {
  CellValue,
  Matrix,
  ParsedSheet,
  FormulaConfigEntry,
  FormulaResult,
  FormulaErrorCode,
  SpreadsheetValue,
} from './types'
