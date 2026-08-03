# Excel-sourced tables

`ExcelSourceFileControl` is a `FileControl` that also parses the uploaded
workbook in the browser, writing its rows into a sibling array field and any
derived values into sibling fields. It is registered in `radixRenderers` and
activates only on an explicit opt-in, so existing forms are unaffected.

The rows themselves are displayed by the ordinary `ArrayControl` — no separate
table renderer is involved.

## Why this shape

Users are routinely given a spreadsheet template, fill it in offline, and
upload it. Without this, the file is a dead attachment: the same figures then
get retyped into the form by hand, and nothing downstream can read them.

Parsing happens in the browser, at the moment the file is picked, so the user
sees the extracted table _before_ submitting and can correct the sheet and
re-upload. The file still uploads exactly as it did — same storage key, same
`UploadProvider` contract. Nothing about the upload path changes.

## Declaring it

Everything is driven from the JSON schema. The package contains no column
names, formulas, or domain knowledge.

```jsonc
{
  "sales_file": {
    "type": "string",
    "format": "file",
    "title": "Upload Sales Sheet",
    // FileControl filters the picker and validates against this list, so an
    // extension left out here never reaches the parse.
    "x-file": { "accept": ".xlsx,.xlsm" },
    "x-excel": {
      // Sibling array field the parsed rows are written to.
      "target": "sales",

      // How to recognise each column. Header text is matched
      // case/space/punctuation-insensitively, so "Rate\nPer KG",
      // "RATE PER KG" and "Rate per Kg." all match "rate per kg".
      "columns": {
        "date_of_sale": { "match": ["date of sale", "sale date"], "type": "date", "required": true },
        "garden_mark": { "match": ["garden mark", "garden"], "type": "string" },
        "quantity_kg": { "match": ["qty in kg", "quantity in kg"], "type": "number", "required": true },
        "total_value": { "match": ["total value rs", "total value"], "type": "number" },
      },

      // Sibling fields computed from the parsed rows, as Excel formulas.
      "derive": {
        "total_quantity_kg": "SUM(quantity_kg)",
        "avg_rate_per_kg": "ROUND(SUM(total_value) / SUM(quantity_kg), 2)",
        "dominant_grade": "INDEX(grade, MATCH(MAX(quantity_kg), quantity_kg, 0))",
      },
    },
  },
}
```

## Displaying the rows

The target array is rendered by the ordinary `ArrayControl`. Two things make it
read sensibly for machine-extracted rows:

```jsonc
{
  "type": "Control",
  "scope": "#/properties/sales",
  "options": {
    // Group the columns into short rows. HorizontalLayout gives every element
    // an equal share of the width, so a single line of ten controls squeezes
    // each to a tenth and clips the longer values; three or four per line
    // keeps every value fully visible and the labels on one line.
    "detail": {
      "type": "VerticalLayout",
      "elements": [
        {
          "type": "HorizontalLayout",
          "elements": [
            { "type": "Control", "scope": "#/properties/date_of_sale" },
            { "type": "Control", "scope": "#/properties/sale_code" },
            { "type": "Control", "scope": "#/properties/lot_no" },
          ],
        },
        {
          "type": "HorizontalLayout",
          "elements": [
            { "type": "Control", "scope": "#/properties/garden_mark" },
            { "type": "Control", "scope": "#/properties/grade" },
          ],
        },
        {
          "type": "HorizontalLayout",
          "elements": [
            { "type": "Control", "scope": "#/properties/rate_per_kg" },
            { "type": "Control", "scope": "#/properties/quantity_kg" },
            { "type": "Control", "scope": "#/properties/total_value" },
          ],
        },
      ],
    },
  },
}
```

Mark `target` and every derived property **`readOnly`** in the schema. Besides
being accurate — they are written by the parse, not typed — `readOnly` is what
suppresses `ArrayControl`'s "Add Item" and "Remove" buttons, which have no
meaning for rows that come from a file.

If the array's `title` is set, `ArrayControl` renders it as the section heading,
so don't also label a surrounding `Group` with the same text — it prints twice.

Trade-offs of reusing `ArrayControl` rather than a purpose-built grid: field
labels repeat on every row instead of appearing once as a header, values render
in disabled inputs so numbers are neither right-aligned nor thousands-separated,
and there is no totals footer.

## Derived fields are Excel formulas

Each `derive` entry is an ordinary Excel expression. Any function the engine
supports is available — `SUM`, `AVERAGE`, `ROUND`, `IF`, `SUMIF`, `SUMPRODUCT`,
`INDEX`/`MATCH`, `MAX`/`MIN`, `TEXTJOIN`, `COUNT`/`COUNTA`, `CONCATENATE`,
`IFERROR`, `ABS`, `VLOOKUP`, and so on:

```jsonc
"derive": {
  "total_quantity_kg": "SUM(quantity_kg)",
  "avg_rate_per_kg":   "ROUND(SUM(total_value) / SUM(quantity_kg), 2)",
  "top_grade":         "INDEX(grade, MATCH(MAX(quantity_kg), quantity_kg, 0))",
  "all_grades":        "TEXTJOIN(\", \", TRUE, grade)",
  "bop_quantity":      "SUMIF(grade, \"BOP\", quantity_kg)",
  "size_band":         "IF(SUM(quantity_kg) > 30000, \"BULK\", \"SMALL\")"
}
```

### References are column names, not cell addresses

A bare column key stands for that column across every parsed row — so
`SUM(quantity_kg)` is the whole column, however many rows the sheet held.

This is deliberate, and the reason raw ranges are not the addressing model.
The row parser locates the header by scoring rather than by position, so a
range like `SUM(I4:I13)` would drift the moment a template gained a banner row
or moved a column — silently, because the row parse itself would still
succeed. Worse, ranges that overshoot the data reach the template's trailing
`TOTAL` row: on a two-row sheet totalling 35,000 kg, both `SUM(I4:I100)` and
`SUM(I:I)` return **70,000**, double-counting the total. Column names cannot
express that mistake, because only real data rows are addressable.

### `cell()` for the header block

Values that genuinely live at a fixed address — the header block above the
grid, which has no column to match — are read with `cell()`:

```jsonc
"derive": {
  "blend_sheet_no": "cell(B2)",
  "blend_summary":  "CONCATENATE(cell(A1), \" / \", cell(B2))"
}
```

`cell()` reads the **raw** sheet at that exact address and substitutes the
value before evaluation. Being a literal address, it carries the layout
coupling described above: use it for the header block, not for the grid.

### When a formula cannot produce a value

The field is left empty and the reason is reported to the user in the upload
callout, naming the field. Silence would be worse than an error — an empty
total reads as "the sheet contained none" rather than "the calculation
failed". Reported cases include:

- **Excel error values** — `#DIV/0!`, `#NAME?`, `#VALUE!`.
- **A column whose header never matched.** Excel sums an empty range to `0`, so
  this is caught before evaluation and reported instead: a column the template
  omitted must never surface as a confident zero. A column that _did_ match but
  happens to be blank in every row is not this case — it aggregates to `0` as
  Excel would, because the sheet does carry it.
- **Unimplemented functions** and syntax errors, quoted verbatim.
- **No parsed rows**, where every aggregate would be over an empty set.

## What the parser tolerates

- **Banner rows above the grid.** The header row is found by scoring every row
  in the first 25 (`headerSearchRows`) against the declared columns and taking
  the best match, rather than assuming row 1.
- **Reordered or extra columns.** Columns are located by header text, not
  position. Unmatched declared columns are reported in `missingColumns` and
  surfaced to the user.
- **Blank spacer rows**, and rows missing a `required` column — skipped and
  counted in `skippedRows`.
- **Trailing `TOTAL` / `GRAND TOTAL` rows** — recognised and excluded, so their
  figures never enter the aggregates. Matched against the whole cell, so a
  value like `TOTAL ESTATE` is still treated as data.
- **`dd/mm/yyyy` text dates and comma-grouped numbers** — normalised to ISO
  dates and plain numbers.

A sheet with no recognisable header row raises an error. The file still
uploads: the attachment is usually wanted regardless, and the user can fall
back to whatever manual fields the form offers.

## Notes

- `.xlsx` and `.xlsm` are parsed. Remember to list both in `x-file.accept` —
  `FileControl` filters the picker and validates against that list, so an
  omitted extension never reaches the parse. Other file types on the same field
  (an `.xml` alternative, say) upload normally and clear any previously parsed
  rows. A legacy `.xls` is attempted and reports "You passed a legacy `.xls`
  file", which is more use than an unexplained empty list. The reader inspects
  the file rather than trusting the extension, so a mislabelled workbook still
  parses.
- Removing the uploaded file clears the target array and the derived fields.
- The spreadsheet reader and the formula engine are both reached through
  dynamic `import()`, so applications that use this renderer set without any
  `x-excel` field don't pay for either.
- `parseSheetGrid(grid, spec)` (rows, synchronous) and `evaluateDerived(...)`
  (formulas, async) are exported separately from `parseExcelTable`, so the row
  parse can be tested against a grid from any source.
- A column key that collides with an Excel function name is left alone when it
  is followed by `(`; otherwise prefer distinct keys. Keys are matched
  longest-first, so `total_value` is never partially matched by `total`.
- Formula evaluation uses [`fast-formula-parser`](https://github.com/LesterLyu/fast-formula-parser)
  (MIT). It does not implement `MAX`, `MIN`, `COUNTA`, `MATCH` or `TEXTJOIN`,
  which the everyday aggregate-and-look-up shape needs, so those five are
  supplied from [`@formulajs/formulajs`](https://github.com/formulajs/formulajs)
  (MIT). Everything else resolves against the parser's own set; an unsupported
  function reports `Function X is not implemented`. HyperFormula, the more
  complete engine, is GPL-3.0-only and so unusable in an Apache-2.0 package.
