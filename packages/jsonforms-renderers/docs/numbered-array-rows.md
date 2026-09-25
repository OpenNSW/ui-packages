# Auto-numbered array rows (`x-template`)

`x-template` on a property inside an array's `items` gives each row a reference as it is added, instead of asking the user to type one:

```json
"lineRef": {
  "type": "string",
  "readOnly": true,
  "x-template": {
    "template": "{orderNo}-{orderDate}-{seq}",
    "inputs": { "orderNo": "orderNo", "orderDate": "orderDate" },
    "padding": 2
  }
}
```

Rows come out `ORD-77-2026-05-04-01`, `-02`, `-03`. `ArrayControl` fills the value in once, when the row is added, and never touches it again.

Pair it with `readOnly: true`. The keyword says where the value comes from, not whether it can be edited — the same split [`x-computed`](./computed-fields.md) makes.

## `template`

Substitution is [`utils/template.ts`](../src/utils/template.ts)'s, shared with `x-computed`'s `format`. This keyword adds only where a placeholder's value comes from, and the count behind `{seq}`.

- `{seq}` is the row's number, zero-padded to `padding` digits (default 2). A number wider than the padding is not truncated — row 100 of a `padding: 2` array is `100`, not `00`.
- Any other bare `{name}` is read from the form.
- `{name(arg)}` is a call, resolved against the engine's function registry rather than looked up in form data: `{today()}` is the current date as `YYYY-MM-DD`, `{today(YYYYMMDD)}` gives `20260504`.

A placeholder with nothing behind it renders as empty — never `undefined`, and never the placeholder itself. This is where `x-template` deliberately differs from the shared engine, which leaves an unknown placeholder standing as written so a typo stays visible. That is right for `x-computed`'s display-only `format`; here the value is **persisted**, and storing a literal `{orderDate}` in a row is worse than storing a gap.

`{seq}` cannot be shadowed by a form field of that name: a row's number must not depend on what someone typed into a field called `seq`.

## `inputs`: alias → path

Paths work exactly as in [`x-computed`](./computed-fields.md#inputs-alias--path): the same dot-joined convention every JSONForms `ControlProps.path` uses, resolved with `Resolve.data`. `{ path, default }` supplies a value for a path that resolves to nothing.

`inputs` is optional. **A placeholder with no entry resolves as a path of its own name**, so it is only needed to alias a deeper path (`"ordered": "meta.dates.ordered"`) or to give one a default. The example above behaves identically with `inputs` omitted.

**Paths resolve against the object that contains the ARRAY**, not against the row. A row being numbered does not exist yet, so there is nothing in it to read — `{orderNo}` on a row of `order.lineItems` resolves against `order`.

## What numbering guarantees

The count is held by `ArrayControl` for as long as the array is on screen, not derived from the rows. Deriving it from a row's position, or from the highest number still present, would hand a deleted row's number to the next row added — two rows that existed at different times going out under one number.

Each new row gets one past whichever is higher: what the counter has issued, or the highest number the rows themselves carry. Reading only the counter would walk through a number that rows arriving from elsewhere — loaded data, an undo, a paste — already hold. Reading only the rows would reissue a deleted row's number.

When reading numbers back out of existing rows, values the template did not produce are ignored, and the fields around the number are wildcarded — so rows numbered before an order's date was corrected still count.

### Known gap: the counter does not survive a remount

`ArrayControl` holds the counter in a ref, so anything that unmounts the control starts it empty again. This is reachable today: `CategorizationLayoutRenderer` renders its tabs with Radix `Tabs.Content` and no `forceMount`, so an inactive tab's contents unmount, and both ship in the same `radixRenderers` export.

What survives is the reconciliation above — an empty counter falls back to the numbers the rows carry, so numbering continues from the visible maximum rather than restarting at 1. What is lost is only the no-reuse guarantee across that remount: delete the highest-numbered row, switch tabs, come back, add a row, and that number is issued a second time. Persisting the counter alongside the form's data would close it; nothing does today.

## Not implemented: unnumbered templates

An `x-template` without `{seq}` is ignored. Such a template has nothing to remember and no reason to freeze at the moment a row was added — it would instead need to _follow_ its inputs as they change, which is a renderer's job. No control does that yet.
