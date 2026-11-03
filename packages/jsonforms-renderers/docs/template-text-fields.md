# Text fields (`x-text`)

`TemplateTextControl` writes a `type: 'string'` field from other values in the form. Its main use is text built from the items of an array, such as one line per item, offered as a prefill the user can then edit:

```json
"additional_information": {
  "type": "string",
  "title": "Additional information",
  "x-text": {
    "inputs": {
      "treatments": {
        "path": "items.*",
        "aggregate": "join",
        "where": "treatment_type",
        "template": "{commodity_name}: {treatment_type} · {chemical_used} · {conditions}",
        "separator": "\n"
      }
    },
    "template": "{treatments}",
    "editable": true
  }
}
```

With three items, one untreated and one without a chemical, the field is filled with:

```
Tea: Fumigation · Methyl bromide · 24 h at 21 °C
Cinnamon: Heat treatment · 56 °C for 30 min
```

For a number, use [`x-computed`](./computed-fields.md).

## `inputs`

The same as [`x-computed`'s inputs](./computed-fields.md#inputs-alias--path): an alias mapped to a path relative to the field's parent object, `{ path, default }` for an optional value, or `{ path, aggregate }` for a number across array items. The same mistakes are shown as errors. `x-text` adds one aggregate, `join`.

### `join`: one text from every array item

A `*` path with `"aggregate": "join"` turns everything the path matches into one text. It matches as the other aggregates do: a path can have more than one `*`, and an array with no items yet gives no items, so the text is empty rather than unavailable.

| Option      | What it does                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `template`  | How each item is written, in an [array card's summary](./array-cards.md) syntax: `{field}` or `{a.b}` within the item, parts split on `·`, and a part whose fields are all empty left out. Without it, each matched value is written as a card shows it. |
| `where`     | A field within the item. Only items where that field has a value are kept, such as only treated items.                                                                                                                                                   |
| `skip`      | Leaves out the first that many texts, counted after `where` and after empty texts are dropped. `"skip": 1` leaves out the first treated item.                                                                                                            |
| `separator` | Joins the texts. Default `", "`. Use `"\n"` for one line per item.                                                                                                                                                                                       |
| `default`   | Text that stands in for a matched value that's blank.                                                                                                                                                                                                    |

Values are written as array cards show them: an option's code as its `oneOf`/`anyOf` title, a number with the locale's separators, a search pick as its `label`. The schemas for this come from the form's schema along the path.

Only `x-text` takes `join`. `x-computed` shows it as an error, since it needs a number.

## `template`

The field's text, with `{alias}` for each input, in the same syntax as other templates in this package ([`utils/template.ts`](../src/utils/template.ts)). `{today(DD/MM/YYYY)}` gives today's date. A plain input is written as a card shows it, the same as a `join`'s items: an option's title, a search pick's label, a number with the locale's separators. A true/false is written as `true` or `false`. Leading and trailing whitespace is trimmed.

## `editable`

- **`false` (default): read-only.** Shown as text, like `x-computed`. The text is written again and saved whenever an input changes. A missing input, a mistake in the inputs or an empty result saves no value, so no stale text is left behind.
- **`true`: a prefill, then the user's.** Shown as a text area. A field that has never had a value is filled with the text, once. From then on it is the user's: it is left alone when the inputs change, and the user can change or remove all of it. A cleared field saves `""`, so it stays empty, also when the form is opened again. Only a field with no value at all is filled. A missing input or a mistake in the inputs leaves the saved text as it is.

  JSON Schema's `required` is satisfied by `""`. A required field that must hold text needs `"minLength": 1` as well.

## Behavior

- **A form that's read-only as a whole** (`<JsonForms readonly>`, such as a submitted record) is never written to. A read-only field shows the current text; an editable one shows its saved text.
- **A disabled or read-only editable field** is not filled. It belongs to someone else's step, so it isn't this user's to prefill.
- **A field a rule hides** has its value removed, as other controls do, so an editable one is filled again when it's shown.
- **Inputs come from the form's own data.** The items a `join` reads must be in this form's data, not only in data passed elsewhere.
- **Chains** work as with `x-computed`: an input can be another computed or text field's saved value.
