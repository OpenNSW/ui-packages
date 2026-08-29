# Spreadsheet formulas (`x-evaluate`)

`SpreadsheetControl` evaluates Excel-style formulas against an uploaded sheet, configured via the schema's `x-evaluate` array:

```json
"x-evaluate": [
  { "id": "total_quantity", "label": "Total Quantity", "expression": "=SUM(I2:I6)" }
]
```

Cell and range addressing is literal (`B2`, `I2:I6`), the same as in Excel — row 1 is always the sheet's first row, column A is always the sheet's first column, regardless of the control's `columnHeader`/`rowHeader` display options.

Formulas are parsed and evaluated by [`fast-formula-parser`](https://www.npmjs.com/package/fast-formula-parser), backfilled with [`@formulajs/formulajs`](https://www.npmjs.com/package/formulajs) for functions the former only stubs out or gets wrong for our data (both MIT licensed).

## Supported functions

| Category | Functions                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Math     | `SUM` `AVERAGE` `COUNT` `COUNTA` `MIN` `MAX` `MAXA` `MINA` `MEDIAN` `LARGE` `SMALL` `PERMUT` `PERMUTATIONA` `ROUND` `ROUNDUP` `ROUNDDOWN` |
| Logical  | `IF` `IFERROR` `IFS` `SWITCH` `AND` `OR` `NOT`                                                                                            |
| Text     | `CONCATENATE` `CONCAT` `TEXTJOIN` `SUBSTITUTE` `LEFT` `RIGHT` `MID` `LEN` `TRIM` `UPPER` `LOWER` `FIND` `SEARCH`                          |
| Lookup   | `INDEX` `MATCH` `VLOOKUP` `HLOOKUP`                                                                                                       |
| Date     | `DATE` `YEAR` `MONTH` `DAY` `WEEKDAY` `TODAY`                                                                                             |

Operators: `+ - * / ^ %`, `&` (concatenation), `= <> < > <= >=` (comparison). String literals in double quotes (`""` for a literal quote), `TRUE`/`FALSE` literals.

Calling any function not on this list fails with `#NAME?` before evaluation ever starts — this is an allowlist, not a blocklist. See `formulaFunctions.ts` to add one (it needs to be verified against the installed library first — see that file's module comment).

## Known scope decisions

- **`MATCH` is always exact-match**, regardless of the `match_type` argument. Approximate/sorted matching isn't offered, since it would silently mis-rank unsorted real-world uploads.
- **`MAXIFS`/`MINIFS`/`AVERAGEIFS` aren't supported.** They need parallel criteria ranges (a value range plus one or more matching criteria ranges), a materially bigger feature than everything else on this list.
- **`IF`/`IFERROR` don't fully short-circuit.** A bare reference (`IF(FALSE, B100, 99)`) or a computed error (`IF(FALSE, 1/0, 99)`) both correctly skip the untaken/caught branch. An invalid reference _nested inside another function call_ in that branch does not — e.g. `IFERROR(VLOOKUP(...), "Not found")` still fails if `VLOOKUP`'s range points at a column the sheet doesn't have. Don't rely on `IF`/`IFERROR` to hide a broken reference buried inside a nested function call.

## Why these libraries, not a hand-rolled parser or HyperFormula

`HyperFormula` is GPL-licensed, incompatible with this package's Apache-2.0 license. `fast-formula-parser` + `@formulajs/formulajs` are both MIT, with every transitive dependency MIT or Apache-2.0.

Several functions in the pinned `fast-formula-parser` version are silent no-op stubs (they return `undefined` instead of erroring). `formulaFunctions.ts`'s allowlist exists specifically to stop any of those from producing a blank result that looks like a valid answer — a function not on the allowlist always fails loudly with `#NAME?`, even ones the library would otherwise accept and silently do nothing with.
