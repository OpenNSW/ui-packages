// fast-formula-parser ships as CommonJS with no type declarations at all.
// Only the surface `expression.ts` and `formulaFunctions.ts` actually use is
// described here. Notably absent: the default-exported `FormulaParser` class
// itself (both files obtain it via a dynamic `import()` cast through
// `unknown` to their own hand-rolled structural type instead, since the
// module's CJS/ESM interop shape isn't knowable statically — see
// expression.ts) and the `FormulaError` members neither file ever reads
// (`.equals()`, the static `.REF`/`.DIV0`/`.NAME`/`.NUM`/`.NULL` accessors,
// and the static `.NOT_IMPLEMENTED()`/`.ERROR()` factories).
declare module 'fast-formula-parser' {
  export type CellRef = { row: number; col: number; sheet?: string }
  export type RangeRef = { from: CellRef; to: CellRef; sheet?: string }

  // The library's own error type. A formula that legitimately evaluates to an
  // Excel error (e.g. `=1/0`) returns an instance of this as a *value* from
  // `parse()` rather than throwing; a syntax error or an exception raised
  // while evaluating (including one thrown from our own onCell/onRange hooks)
  // is thrown as an instance of this instead, always coded `#ERROR!` at the
  // outer layer, with the real cause attached as `.details`.
  export class FormulaError extends Error {
    constructor(code: string, message?: string, details?: unknown)
    readonly error: string
    readonly details?: unknown
    static readonly VALUE: FormulaError
    static readonly NA: FormulaError
  }
}
