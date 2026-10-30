# List items as cards, and removing items

## Removing an item or a file

Every list item's **Remove** and every uploaded file's **Remove** (in the file's **More actions** menu, next to View and Download) asks first: "Remove Item 2 (MEDIUM · 240 bags)?", with **Keep item** focused and **Remove item** to go ahead. After a removal, a status line says what was removed ("Item 2 removed. Now 1 item · 500 bags.") and focus moves to the item now in its place, or to **Add Item** when the list is empty.

## Cards

A list whose uiSchema sets `options.display: "cards"` shows each item as a one-line card instead of its full form. Clicking a card opens the item in a dialog to view or edit it; **Add Item** opens the same dialog for a new item, where **Cancel** discards it. In a read-only form the dialog is view-only. A card whose fields have errors says **Needs attention**, once the form shows errors at all.

```json
{
  "type": "Control",
  "scope": "#/properties/dc_grades",
  "options": {
    "display": "cards",
    "itemLabel": "DC Grade",
    "summary": "{dc_grade} · {number_of_bags} bags",
    "summaryDetail": "{total_weight} kg total · {weight_of_bag} kg per bag",
    "totals": [
      { "field": "number_of_bags", "label": "{sum} bags" },
      { "field": "total_weight", "label": "{sum} kg total" }
    ],
    "detail": { "type": "VerticalLayout", "elements": [ ... ] }
  }
}
```

| Option          | Meaning                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `display`       | `"cards"` turns cards on. Without it, items show their full form, as before.                                |
| `summary`       | A card's first line. Without it, the card shows "Item 2".                                                   |
| `summaryDetail` | A card's second line.                                                                                       |
| `totals`        | Running totals above the list, after the item count: `field` is summed across items, shown through `label`. |

`summary` and `summaryDetail` name the item's own fields in `{braces}`, as dotted paths for nested ones (`{tarification.hsCode}`); `totals` fields take dotted paths too. The text is split on " · ", and a part whose fields are all empty is left out, so a half-filled item reads "FINE" rather than "FINE · bags". An option's title is shown instead of its value, a search pick shows its `label`, a `{ value }` object shows its value's option title, and numbers get the form's locale separators. `totals` works without cards too.

An item's fields are on the page only while its dialog is open. Fields computed from other fields of the same item still update, since those are edited in the dialog too, and [`x-template`](./numbered-array-rows.md) numbers are given when an item is added.

## The heading, the row name, and the buttons

These apply to every list, with or without cards.

| Option       | Meaning                                                                                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`      | On the Control, the same property as any other control. A string replaces the schema `title`. `false` hides the heading. The required `*` is part of the heading, so it hides with it. A required list with no heading still fails validation, and that message uses the schema title. |
| `itemLabel`  | The word in front of the row number. Without it, rows are "Item 1". `false` hides the row name; Remove and dialog titles still use the summary, or the list heading.                                                                                                                   |
| `itemNumber` | `"word"` spells the number in English: Attachment One, Attachment Twenty-One. 100 and above stay digits. The words are English only.                                                                                                                                                   |
| `addLabel`   | The add button, shown as written. Without it, the button is translated.                                                                                                                                                                                                                |
| `emptyLabel` | The empty-state line, shown as written. Without it, that line is translated.                                                                                                                                                                                                           |

```json
{
  "type": "Control",
  "scope": "#/properties/attachments",
  "label": false,
  "i18n": "attachments",
  "options": {
    "itemLabel": "Attachment",
    "itemNumber": "word"
  }
}
```

`addLabel` and `emptyLabel` are the untranslated shortcut. Leave them off when the wording has to be translated.

## Translation

The wording goes through the form's JSON Forms translator, like the [stepper's](./categorization-stepper.md#translation): `list.<key>` and `upload.<key>`, with English defaults exported as `LIST_MESSAGES` and `UPLOAD_MESSAGES`.

A list can give itself a different wording. The key is `<prefix>.list.<key>`, and `<prefix>` is the control's `i18n`, or the schema's `i18n`, or the data path with array indexes removed (`attachments` for a control at `order.attachments`). A key the translator does not have falls back to the global `list.<key>`. The heading is translated by JSON Forms itself, under `<prefix>.label`. `label: false` still hides it when that key has a translation.
