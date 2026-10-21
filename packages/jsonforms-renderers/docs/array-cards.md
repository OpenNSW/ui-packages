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

## Translation

The wording goes through the form's JSON Forms translator, like the [stepper's](./categorization-stepper.md#translation): `list.<key>` and `upload.<key>`, with English defaults exported as `LIST_MESSAGES` and `UPLOAD_MESSAGES`.
