# SearchSelectControl — modes

`x-search.mode` picks one of three lifecycles for how a `SearchSelectControl` field
loads and searches its options. It replaces the old `loadOnOpen` boolean: rather than
exposing `loadOnOpen` / `searchable` / `paginated` as three independent flags (most of
the 8 combinations don't make sense), the control only accepts one of the three modes
below.

```jsonc
{
  "type": "string",
  "x-search": { "service": "countries", "mode": "large-searchable-list" },
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
    "x-search": { "service": "countries", "mode": "large-searchable-list", "params": { "continent": "asia" } },
  },
  "europeanCountry": {
    "type": "string",
    "x-search": { "service": "countries", "mode": "large-searchable-list", "params": { "continent": "europe" } },
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
      "params": { "id": "commodities", "version": "1" },
    },
  },
  "commodity_botanical_name": {
    "type": "string",
    "x-search": {
      "service": "static-data",
      "mode": "small-list",
      "dependsOn": "commodity_common_name",
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

## Display template

Optional `displayTemplate` lets a deployer choose the dropdown label without a
per-field search service. `{id}` and `{name}` are replaced from the option the
service already returns. The stored value is always `id`. Omit the key to keep
today's behaviour (`name` shown).

```jsonc
{
  "point_of_entry_port": {
    "type": "object",
    "x-search": {
      "service": "static-data",
      "mode": "large-paginated-list",
      "displayTemplate": "{id}-{name}",
      "params": { "id": "port-of-entry", "version": "1" },
    },
  },
}
```

A field with no `displayTemplate` is unchanged. Object-typed fields store
`{ value: id, label: templated name }` (or `name` when the template is absent),
so a later open uses the saved label and does not need to re-resolve.

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
