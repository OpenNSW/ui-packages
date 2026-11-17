# Default from a sibling (`x-defaultFrom`)

A field can mirror another field on the same object. Set `x-defaultFrom` to that sibling's property name. Every value control honors it (text, number, boolean, radio, select, search-select, date, file, array, spreadsheet, XML). The field keeps its own control.

The control copies the sibling's current value into this field:

- while this field is empty (on load, first fill, or after the user clears it)
- whenever the sibling changes, including over a value the user set by hand

Clearing the sibling clears this field (`undefined`, the same empty value a cleared control stores). Between sibling changes the field stays editable. Nothing is copied while the form is `readonly`, or this field is disabled or hidden.

`x-computed` is a different keyword. That one replaces the control with a readonly number that is always the formula. `x-defaultFrom` leaves the control in place.

```jsonc
{
  "importing_country": {
    "type": "object",
    "x-search": {
      "service": "static-data",
      "mode": "large-searchable-list",
      "displayTemplate": "{name}",
      "params": { "id": "countries", "version": "1" },
    },
  },
  "consignee_country": {
    "type": "object",
    "x-defaultFrom": "importing_country",
    "x-search": {
      "service": "static-data",
      "mode": "large-searchable-list",
      "displayTemplate": "{name}",
      "params": { "id": "countries", "version": "1" },
    },
  },
}
```

Used for NPQS "Country of Consignee" following "Name of Importing Country": change importing country and consignee country follows; the trader can still pick a different consignee country until importing country changes again.

Give both fields the same shape. Two `type: "object"` search-selects copy `{ value, label }`. Two `type: "string"` fields copy the string. A text, number, boolean, or date field copies that sibling value as it is. Mixing an object search-select into a string field copies the id only, and a string sibling filling an object field stores `{ value }` with no label.

The name is resolved relative to this field's parent object, the same way [`x-computed` inputs](./computed-fields.md) are. `x-search.dependsOn` is separate: use it when this field's options must filter by the sibling, and `x-defaultFrom` when this field should follow the sibling's value.
