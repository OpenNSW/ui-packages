# File upload (`x-file` / `format: "file"`)

`FileControl` is a `Control` renderer for uploading files into form data. The bound field stores one storage key (`type: "string"`) or an array of keys (`type: "array"` of strings), not the file bytes. Upload and download URLs come from `UploadProvider` in the host app.

## What triggers it

The bound schema node must use `format: "file"`:

- `type: "string"` — single file (default `maxFiles: 1`)
- `type: "array"` with `items: { type: "string", format: "file" }` — multi-file when `x-file.maxFiles` is greater than 1

`FileControlTester` ranks 10 so it beats the default string and array renderers.

```jsonc
// schema
{
  "type": "object",
  "properties": {
    "attachment": {
      "type": "string",
      "format": "file",
      "x-file": {
        "accept": "image/*,application/pdf,.xlsx",
        "fileName": "Attachment_{index}",
      },
    },
  },
}
```

```jsonc
// uischema
{ "type": "Control", "scope": "#/properties/attachment" }
```

## Options

| Option     | Type     | Default                     | Meaning                                                                  |
| ---------- | -------- | --------------------------- | ------------------------------------------------------------------------ |
| `maxFiles` | `number` | `1`                         | Maximum uploads. Greater than 1 requires an array schema.                |
| `maxSize`  | `number` | `5242880` (5 MiB)           | Per-file size limit in bytes.                                            |
| `accept`   | `string` | `'image/*,application/pdf'` | Comma-separated MIME types, wildcards, and/or extensions (e.g. `.xlsx`). |
| `fileName` | `string` | _(none)_                    | Base name for the row label and Download — see [File name](#file-name).  |

The same keys may also be set under `uischema.options` for older forms; schema `x-file` wins when both are present.

## File name

`fileName` is a **base name** template. The file's real extension (from the original name, else the storage key) is appended unless the rendered name already ends with that extension.

```jsonc
"fileName": "Attachment_{index}"  // Attachment_1.xlsx for the first .xlsx upload
```

- `{index}` is the file's **1-based position** in the field. Removing an earlier file renumbers later ones (`Attachment_2` becomes `Attachment_1`).
- Other placeholders follow the same `{name}` / `{today(…)}` rules as export `fileName`, but only `{index}` is supplied today (form values and `{seq(…)}` are a follow-up).
- Unsafe characters in the rendered name become `_`.

Without `fileName`, the row label and Download use the original upload name when known, otherwise the storage key.

## View and Download

Each uploaded row has:

- **View** — only when the file matches the browser-viewable allowlist (common images, PDF, HTML, plain text). Opens in a new tab (`window.open`). Types such as `.xlsx` do not show View.
- **Download** — on every row. Fetches the file and saves it under the name from [File name](#file-name).

For a just-uploaded file, both actions use the local blob URL. For a saved form that only has a storage key, they call `UploadProvider.getDownloadUrl`.

## Behavior notes

- Upload failures show in the drop zone. View/Download failures show as a per-row message under that row (so they remain visible when the control is read-only or the single-file slot is full), and clear on the next attempt.
- **Download fetches the signed storage URL in the browser**, so the storage bucket must allow CORS `GET` from the app origin. Confirm that for each deployment (trader app, agency portal, etc.); it is outside this package.
- Removing the last file clears the field with `undefined` (not `null`) so a `type: "string"` schema stays valid.
- The control renders nothing when `visible` is `false`. When read-only with no files, it also renders nothing.
