import { read, utils } from '@e965/xlsx'
import type { CellValue, ParsedSheet } from './types'

// Thrown for well-formed-but-unexpected sheet situations (no sheets, or a
// requested sheet name that doesn't exist) — as opposed to a genuinely
// unreadable/corrupt file, which xlsx itself throws a generic error for.
// Callers can use this to show a precise message instead of a catch-all one.
export class SheetParseError extends Error {}

// Parses one sheet of a workbook into an address-preserving matrix: no
// header-stripping, so a formula's `B2` maps exactly onto `matrix[1][1]`.
// Defaults to the workbook's first sheet when `sheetName` is omitted.
export function parseWorkbookToMatrix(buffer: ArrayBuffer, sheetName?: string): ParsedSheet {
  const workbook = read(buffer, { type: 'array', cellDates: true })

  if (workbook.SheetNames.length === 0) {
    throw new SheetParseError('This file has no sheets.')
  }

  const resolvedName = sheetName ?? workbook.SheetNames[0]
  const worksheet = workbook.Sheets[resolvedName]
  if (!worksheet) {
    throw new SheetParseError(`This file doesn't have a sheet named "${resolvedName}".`)
  }

  const matrix = utils.sheet_to_json<CellValue[]>(worksheet, { header: 1, raw: true, defval: null })

  return {
    sheetName: resolvedName,
    matrix,
    rowCount: matrix.length,
    colCount: Math.max(0, ...matrix.map((row) => row.length)),
  }
}

// 0-based column index -> spreadsheet column letter (0 -> 'A', 25 -> 'Z', 26 -> 'AA').
export function columnLetter(index: number): string {
  let n = index + 1
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}
