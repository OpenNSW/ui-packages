# SearchSelectControl — modes

`x-search.mode` picks one of three lifecycles for how a `SearchSelectControl` field
loads and searches its options. It replaces the old `loadOnOpen` boolean: rather than
exposing `loadOnOpen` / `searchable` / `paginated` as three independent flags (most of
the 8 combinations don't make sense), the control only accepts one of the three modes
below.

Tester rank is 4 (above ArrayControl at 3 and Select at 2), so array fields whose
`items` carry `x-search` render as this control instead of Add Item cards.

```jsonc
{
  "type": "string",
  "x-search": { "service": "countries", "mode": "large-searchable-list", "displayTemplate": "{name}" },
}
```

`service` names a `SearchService` registered via `SearchServiceProvider` (see
`SearchServiceContext.tsx`). `mode` is optional — an unconfigured `mode` defaults to
`large-paginated-list` (the safest choice when the data size is unknown). An unregistered
service or a `mode` set to something other than one of the three values below renders as
inline text in the dropdown instead of throwing.

## Fixed extra arguments (`params`)

One registered service can back several fields that hit the same endpoint with different
fixed filters, via `x-search.params`:

```jsonc
{
  "asianCountry": {
    "type": "string",
    "x-search": {
      "service": "countries",
      "mode": "large-searchable-list",
      "displayTemplate": "{name}",
      "params": { "continent": "asia" },
    },
  },
  "europeanCountry": {
    "type": "string",
    "x-search": {
      "service": "countries",
      "mode": "large-searchable-list",
      "displayTemplate": "{name}",
      "params": { "continent": "europe" },
    },
  },
}
```

`params` is forwarded as-is to both `search({ query, cursor, signal, params })` and
`resolve(value, params)` — the service decides what to do with it (e.g. append it as a
query filter). `params` is fixed per field: it comes from the schema, not from other
fields' live values.

## Live sibling filter (`dependsOn`)

To filter this field by what was picked in another field on the same object, set
`x-search.dependsOn` to that sibling's property name. The control reads the sibling's
current value (a string, or `{ value, label }`) and merges it into `params.parent` on
every `search`/`resolve` call. Changing the sibling clears this field. Until a sibling
value is set, the dropdown shows "Select the related field first." instead of fetching.

```jsonc
{
  "commodity_common_name": {
    "type": "object",
    "x-search": {
      "service": "static-data",
      "mode": "large-searchable-list",
      "displayTemplate": "{name}",
      "params": { "id": "commodities", "version": "1" },
    },
  },
  "commodity_botanical_name": {
    "type": "string",
    "x-search": {
      "service": "static-data",
      "mode": "small-list",
      "dependsOn": "commodity_common_name",
      "displayTemplate": "{name}",
      "params": { "id": "scientific-names", "version": "1" },
    },
  },
}
```

A string `dependsOn: "commodity_common_name"` is the same as
`{ "parent": "commodity_common_name" }`. For more than one live filter, use a map of
query-param name → sibling property (`dependsOn: { "commodity": "commodity_common_name", "origin": "country" }`).
Fetching waits until every listed sibling has a value; changing any sibling that already
had a value clears this field.

## Default from a sibling

To mirror another field, set [`x-defaultFrom`](./default-from.md) on the schema. It is not
an `x-search` option: the same keyword works on every value control, and the field stays
editable between sibling changes. `dependsOn` still only filters this field's options.

## Display template

`displayTemplate` is required on every `x-search` field. `{id}` and `{name}` are
replaced from the option the service already returns. The stored value is always
`id`. `"displayTemplate": "{name}"` is the usual label; `"{id}-{name}"` shows
both. A name the option does not have stays as written, so a typo shows up in
the label. A missing or empty template renders as inline config text in the dropdown
instead of fetching.

```jsonc
{
  "country": {
    "type": "object",
    "x-search": {
      "service": "static-data",
      "mode": "large-searchable-list",
      "displayTemplate": "{name}",
      "params": { "id": "countries", "version": "1" },
    },
  },
  "place": {
    "type": "object",
    "x-search": {
      "service": "static-data",
      "mode": "large-paginated-list",
      "displayTemplate": "{id}-{name}",
      "params": { "id": "places", "version": "1" },
    },
  },
}
```

Object-typed fields store `{ value: id, label: templated name }`. A later open
uses the saved label and does not re-resolve.

## Multi-select (`type: "array"`)

Multi mode is inferred from `schema.type === "array"` with `x-search` on `items`.
There is no separate `multiple` flag. Single string/object fields stay single-select.

Stored shapes:

- `items.type: "object"` (with `value` / `label`): `[{ value, label }, …]`
- `items.type: "string"`: `["id", …]`. Chips keep labels from the pick, and on mount
  each id is resolved through the service so preloaded forms show names, not raw ids.

`schema.maxItems` is enforced in the UI: once the cap is reached, further picks are
ignored (unselected options are disabled). Removal and de-selection still work. AJV
still validates preloaded data that already exceeds the cap.

`dependsOn` behaves like single-select: changing a previously set sibling clears the
whole multi selection.

```jsonc
{
  "transitCountries": {
    "type": "array",
    "maxItems": 5,
    "items": {
      "type": "object",
      "x-search": {
        "service": "countries",
        "mode": "large-searchable-list",
        "displayTemplate": "{name}",
      },
      "properties": {
        "value": { "type": "string" },
        "label": { "type": "string" },
      },
      "required": ["value"],
    },
  },
}
```

## The three modes

| mode                    | fetch on open | typing          | pagination  |
| ----------------------- | ------------- | --------------- | ----------- |
| `small-list`            | yes           | no (click-only) | no          |
| `large-searchable-list` | yes           | debounce-search | no          |
| `large-paginated-list`  | no            | debounce-search | "Load more" |

### `small-list`

For option sets small enough to show in full — the field fetches once when opened and
the dropdown is browse-and-pick only; typing is disabled.

```
Open
 ↓
GET /endpoint
 ↓
Display results
```

### `large-searchable-list`

For larger sets where an initial page is still useful, refined by typing.

```
Open
 ↓
GET /endpoint
 ↓
Display results
 ↓
User types
 ↓
debounce
 ↓
GET /endpoint?search=...
 ↓
Display filtered results
```

### `large-paginated-list`

For sets too large to fetch anything until the user searches, then paged.

```
Open
 ↓
Don't fetch
 ↓
User searches
 ↓
GET /endpoint?search=...
 ↓
Display page 1
 ↓
Next page
 ↓
GET /endpoint?search=...&page=2
```

## See also

`search-control-design.md` records the earlier decision to route all data-fetching
through a `SearchService` (rather than a declarative fetch config in the schema);
`mode` only changes how the control _calls_ that service, not the service contract
itself.
