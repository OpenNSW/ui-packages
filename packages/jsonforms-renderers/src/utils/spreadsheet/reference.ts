import type { FormulaErrorCode } from './types'

// This file used to also contain a hand-rolled address parser (tokenizing
// `B2`/`B2:B5`-style references and resolving them against a matrix) — that
// logic is gone now that `fast-formula-parser` parses A1-style addresses
// itself and calls back into `expression.ts`'s `onCell`/`onRange` hooks with
// already-computed `{row, col}` coordinates (see expression.ts). What's left
// here is the small, still-standalone pieces: the shared error class, and the
// bijective base-26 column conversion, kept in case a future feature (e.g. an
// address in an error message) needs it — nothing in this package currently
// imports it outside this file's own tests.

export class FormulaError extends Error {
  code: FormulaErrorCode

  constructor(code: FormulaErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = 'FormulaError'
  }
}

// Excel columns are bijective base-26 (A..Z = digits 1..26 — there is no zero
// digit), so a naive base-26 implementation is wrong for multi-letter columns.
// A -> 0, Z -> 25, AA -> 26, AZ -> 51, BA -> 52.
export function columnLetterToIndex(letters: string): number {
  let value = 0
  for (const ch of letters.toUpperCase()) {
    value = value * 26 + (ch.charCodeAt(0) - 64)
  }
  return value - 1
}

// Inverse of columnLetterToIndex. Duplicated (rather than cross-imported from
// parse.ts's columnLetter) so this file's only external need is types.ts.
export function indexToColumnLetter(index: number): string {
  let n = index + 1
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}
