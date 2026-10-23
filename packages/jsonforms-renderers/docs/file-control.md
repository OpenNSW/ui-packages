# File upload (`x-file` / `format: "file"`)

`FileControl` is a `Control` renderer for uploading files into form data. The bound field stores one file reference (`type: "string"`) or an array of them (`type: "array"` of strings), not the file bytes. The control treats a reference as opaque: it reads nothing about the file from it. Upload and download URLs come from `UploadProvider` in the host app.

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

`maxFiles`, `maxSize` and `accept` may also be set under `uischema.options` for older forms; schema `x-file` wins when both are present. `fileName` is read from `x-file` only.

## File name

`fileName` is a **base name** template. The file's real extension (from the original name, else the `extension` `getDownloadUrl` reports for a saved file) is appended unless the rendered name already ends with that extension.

```jsonc
"fileName": "Attachment_{index}"  // Attachment_1.xlsx for the first .xlsx upload
```

- `{index}` is the file's **1-based position** in the field. Removing an earlier file renumbers later ones (`Attachment_2` becomes `Attachment_1`).
- Other placeholders follow the same `{name}` / `{today(…)}` rules as export `fileName`, but only `{index}` is supplied today (form values and `{seq(…)}` are a follow-up).
- Unsafe characters in the rendered name become `_`.

Without `fileName`, the row label and Download use the original upload name when known. A saved file's original name is not, so its row reads `Uploaded File` and it downloads as `Uploaded File` plus its extension.

## View and Download

Each uploaded row has:

- **View** — for a just-uploaded file, only when the type the browser reports for the file the user chose is a PNG, JPEG, GIF or WebP image, a PDF or plain text. The preview is a blob made from that file, which the browser serves with that type, so the file's name does not count: a file with no reported type, or with a type such as `.xlsx`, `.html` or `.xml`, does not show View. A saved file always shows View (see below). View opens in a new tab (`window.open`) that is cut off from the page that opened it.
- **Download** — on every row. Fetches the file and saves it under the name from [File name](#file-name).

For a just-uploaded file, both actions use the local blob URL. For a saved form that only has a reference, they call `UploadProvider.getDownloadUrl`.

`getDownloadUrl` returns the URL and when it expires, and should also return what the server knows about the file: its `extension` (with its dot, e.g. `.xlsx`), its `mimeType`, and its `disposition`, `inline` when the server serves the file for a browser to open and `attachment` when it only serves it to be saved. The control asks it only when a saved file is viewed or downloaded, each time, so nothing about a saved file is known before then: its row name has no extension and it is offered View. Download names the file with the reported extension.

A saved file's View opens it in a tab only when the `disposition` is `inline`. For `attachment`, or when `getDownloadUrl` reports no `disposition`, View downloads the file instead, so the control never opens a file the server has not said is safe to open. The `extension` and `mimeType` are not used to decide.

## Behavior notes

- Upload failures show in the drop zone. View/Download failures show as a per-row message under that row (so they remain visible when the control is read-only or the single-file slot is full), and clear on the next attempt.
- **Download fetches the signed storage URL in the browser**, so the storage bucket must allow CORS `GET` from the app origin. Confirm that for each app using this package; it is outside this package.
- Removing the last file clears the field with `undefined` (not `null`) so a `type: "string"` schema stays valid.
- The control renders nothing when `visible` is `false`. When read-only with no files, it also renders nothing.
