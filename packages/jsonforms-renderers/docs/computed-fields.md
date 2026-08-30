# Computed fields (`x-computed`)

`ComputedControl` reads one or more named values from anywhere in the form's data tree, evaluates a formula written in terms of those names, and persists/renders the result as a readonly `type: 'number'` field, configured via the schema's `x-computed` object:

```json
"total": {
  "type": "number",
  "x-computed": {
    "inputs": {
      "total_sales": "sales.derivations.total_sales_quantity.value",
      "total_imported": "imported_tea.derivations.total_import_quantity.value",
      "total_blend_balance": { "path": "blend_balances.derivations.total_blend_balance_quantity.value", "default": 0 }
    },
    "formula": "total_sales + total_imported + total_blend_balance",
    "format": "{value}",
    "decimals": 2
  }
}
```

## `inputs`: alias → path

Each entry maps an alias (the name used in `formula`) to a path — either a bare string, or `{ path, default }` when the value is legitimately optional.

**Paths are not a syntax invented for this feature.** They're the same dot-joined data-path representation every JSONForms `ControlProps.path` already uses at runtime (`@jsonforms/core`'s own `Resolve.data`/`Paths.compose` — see the source, both just `.split('.')`/join with `.`). A path is resolved **relative to the computed field's own containing object** — e.g. a field at `blendsheet_data.0.total` resolves `"sales.derivations.total_sales_quantity.value"` against `blendsheet_data.0`, reaching `blendsheet_data.0.sales.derivations.total_sales_quantity.value` — the same array item, never a different one. There's currently no way to address an absolute/root path; every input is relative to the field's own parent.

An input can point at:
- A plain, manually-entered sibling field (`"quality_to_be_exported"`).
- One specific `SpreadsheetControl` derivation, via its map path (`"sales.derivations.<id>.value"` — derivations are persisted as a map keyed by each `x-evaluate` entry's `id`, not an array, specifically so they're addressable this way).
- Another **computed** field's own persisted value (`"total"`) — computed fields chain through the same mechanism as any other field.

### `default`

When a path resolves to `null`/`undefined` (an upload that hasn't happened yet, a field left blank) and no `default` is configured, the **whole** computed field goes to `unavailable` — it does not attempt a partial computation with some inputs missing. Configuring `default` lets the computation proceed anyway, which is the right choice for a genuinely optional input (e.g. a spreadsheet upload labeled "if applicable").

## `formula`

Written in terms of the aliases above (not Excel-style cell references), evaluated by the same `fast-formula-parser`/`@formulajs/formulajs` engine `x-evaluate` uses (see [spreadsheet-formulas.md](./spreadsheet-formulas.md)) via the library's own named-variable ("defined name") mechanism — so the full function/operator set documented there (`ROUND`, `IF`, etc.) is available here too, not just `+ - * /`.

**Alias-naming constraint**, inherited directly from the library's grammar (not enforced by this package): an alias must lex as an identifier, which loses to the library's spreadsheet-column token at **equal match length**. In practice:
- A **1-3 letter, all-alphabetic** alias (`a`, `qty`) is read as a spreadsheet column reference, not a variable, and won't work.
- A **longer** alias, or one containing a digit or underscore (`total_sales`, `qty1`, `qty_export`), is unambiguous.
- An alias must not be shaped like a full cell address (`A1`, `B12`) or be `TRUE`/`FALSE` (reserved literals).

When in doubt, use a descriptive `snake_case` alias with an underscore — every example above follows this.

## Behavior

- **The computed value is persisted**, not display-only — `handleChange` writes it to the field's own path, guarded by an equality check so the field's own write can't retrigger its own resolution.
- **Clears to `null` when `unavailable` or on a formula error** (rather than leaving a stale prior value showing). This matters once fields chain: without it, a field reading another computed field's value could silently compute from a number that's no longer true.
- **Chained computed fields settle automatically** — every control re-renders off the same shared root data, so a downstream field's inputs re-resolve on the render that follows an upstream field's own update. A schema author who creates an actual cycle (field A reads field B, which reads field A) is **not detected** and will loop indefinitely — don't do that.
- Restricted to `type: 'number'` for now; a computed field that should produce a string/boolean/date isn't supported yet.
