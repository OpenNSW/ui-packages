export { parseWorkbookToMatrix, columnLetter, SheetParseError } from './parse'
export {
  evaluateExpression,
  evaluateExpressions,
  evaluateFormulaWithVariables,
  describeFormulaError,
} from './expression'
export { processMatrix, shapeSheet, isRecordsSheet } from './process'
export type { ProcessMatrixOptions, ShapeSheetOptions } from './process'
export type {
  CellValue,
  Matrix,
  ParsedSheet,
  FormulaConfigEntry,
  FormulaResult,
  FormulaErrorCode,
  DerivationResult,
  SpreadsheetValue,
  SheetData,
} from './types'
