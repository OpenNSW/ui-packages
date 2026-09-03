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
fields' live values, so it can't express "filter this field by what was picked in that
other field."

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
