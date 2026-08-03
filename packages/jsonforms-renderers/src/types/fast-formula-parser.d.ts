// fast-formula-parser ships no type declarations. Only the surface this package
// uses is described here.
declare module 'fast-formula-parser' {
  export type CellRef = { row: number; col: number; sheet?: string }
  export type RangeRef = { from: CellRef; to: CellRef; sheet?: string }

  export type FormulaParserOptions = {
    onCell?: (ref: CellRef) => unknown
    onRange?: (ref: RangeRef) => unknown[][]
    // Custom or replacement functions, keyed by upper-case Excel name.
    functions?: Record<string, (...args: never[]) => unknown>
  }

  export default class FormulaParser {
    constructor(options?: FormulaParserOptions)
    // Returns the computed value, or a FormulaError instance for #DIV/0! and
    // friends. Throws on a syntax error or an unimplemented function.
    parse(formula: string, position: CellRef): unknown
  }
}
