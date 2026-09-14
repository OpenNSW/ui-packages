# **Table Import Architecture**

Three components, one shared contract: importers hold no data of their own, they only write a 2-D array (or array of records) into the table they're configured to fill.

**XmlImportController** — _changed, was XmlControl_

- Upload .xml → JSON, extract the configured array via arrayPath, write it to write-to. Holds no data of its own.
- Config: arrayPath, write-to, removeNamespaces, accept, maxSize
- Change from today: currently persists the _whole_ document to its own field — stop that; add extraction \+ write-to.

**XlsImportController** — _new, split from SpreadsheetControl_

- Upload .xls/.csv → 2-D array, write it to write-to. Holds no data of its own.
- Config: write-to, accept, maxSize, sheetName, headerRow, columns
- Naming columns (XLS has none by default): headerRow: true uses row 1 as field names; columns: \[...\] sets them explicitly. columns wins if both are set. Neither → raw matrix, no names. A named column with no matching data becomes null, never dropped.

**TableController** — _new, split from SpreadsheetControl_

- Owns a 2-D array at its own field — reads it to render, writes it on manual edit or on any importer write. A declared column (e.g. { column: "D", fn: "sum" }) is recomputed row-locally from the table's own other columns.
- Never uploads a file, reads another field, or resolves a path elsewhere in the form.

**SpreadsheetControl splits in two — nothing else survives:**

| Piece today                                                       | Goes to                 |
| ----------------------------------------------------------------- | ----------------------- |
| Upload, drag-drop, processFile, accept/size matching              | XlsImportController     |
| Grid preview, columnHeader/rowHeader                              | TableController         |
| Manual cell editing                                               | TableController _(new)_ |
| sourcePath, Resolve.data, useJsonForms(), x-evaluate, derivations | Deleted                 |
