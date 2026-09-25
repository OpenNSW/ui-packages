# Templated array rows (`x-template`)

`x-template` on a property inside an array's `items` fills that property in when a row is added, instead of asking the user to type it:

```json
"lineRef": {
  "type": "string",
  "readOnly": true,
  "x-template": {
    "template": "{orderNo}-{orderDate}-{seq(2)}",
    "inputs": { "orderNo": "orderNo", "orderDate": "orderDate" }
  }
}
```

Rows come out `ORD-77-2026-05-04-01`, `-02`, `-03`. `ArrayControl` fills every `x-template` field once, when the row is added, and never touches it again.

Pair it with `readOnly: true`. The keyword says where the value comes from, not whether it can be edited — the same split [`x-computed`](./computed-fields.md) makes.

## `template`

Substitution is [`utils/template.ts`](../src/utils/template.ts)'s, shared with `x-computed`'s `format`. This keyword adds only where a placeholder's value comes from, and `{seq(width)}`.

- A bare `{name}` is read from the form (see `inputs` below).
- `{name(arg)}` is a call: `{today()}` is the current date as `YYYY-MM-DD`, and `{today(YYYYMMDD)}` gives `20260504`.
- `{seq(width)}` is the row's number, zero-padded to `width` digits; `{seq()}` pads to 2. A number wider than that is not truncated — row 100 of `{seq(2)}` is `100`, not `00`. A bare `{seq}` is an ordinary form value.
- `{seq(…)}` needs literal text between it and any other placeholder — `{today(YYYYMMDD)}-{seq(3)}`, not `{today(YYYYMMDD)}{seq(3)}` — or its digits run into its neighbour's and the number can't be read back out of the rows. Such a template is not numbered, and a warning is logged.

A form value with nothing behind it renders as empty, and so does one that can't be printed, such as an object — never `undefined`, and never the placeholder itself. The value is **persisted**, and storing a literal `{orderDate}` in a row is worse than storing a gap. An unknown call such as `{todya()}` is left as written, so the typo stays visible.

## `inputs`: alias → path

Paths work exactly as in [`x-computed`](./computed-fields.md#inputs-alias--path), through the same `resolveComputedInput`: the dot-joined convention every JSONForms `ControlProps.path` uses, resolved with `Resolve.data`. `{ path, default }` supplies a value for a path that resolves to `null`/`undefined`; an empty string is a value, not a gap.

`inputs` is optional. **A placeholder with no entry resolves as a path of its own name**, so it is only needed to alias a deeper path (`"ordered": "meta.dates.ordered"`) or to give one a default. The example above behaves identically with `inputs` omitted.

**Paths resolve against the object that contains the ARRAY**, not against the row. A row being filled does not exist yet, so there is nothing in it to read — `{orderNo}` on a row of `order.lineItems` resolves against `order`.

## What numbering guarantees

The count is held by `ArrayControl` for as long as the array is on screen, not derived from the rows. Deriving it from a row's position, or from the highest number still present, would hand a deleted row's number to the next row added — two rows that existed at different times going out under one number.

Each numbered field of a new row gets one past whichever is higher: what the counter has issued, or the highest number the rows themselves carry. Reading only the counter would walk through a number that rows arriving from elsewhere — loaded data, an undo, a paste — already hold. Reading only the rows would reissue a deleted row's number.

When reading numbers back out of existing rows, values the template did not produce are ignored, and the fields around the number are wildcarded — so rows numbered before an order's date was corrected still count.

### Known gap: the counter does not survive a remount

`ArrayControl` holds the counter in a ref, so anything that unmounts the control starts it empty again. This is reachable today: `CategorizationLayoutRenderer` renders its tabs with Radix `Tabs.Content` and no `forceMount`, so an inactive tab's contents unmount, and both ship in the same `radixRenderers` export.

What survives is the reconciliation above — an empty counter falls back to the numbers the rows carry, so numbering continues from the visible maximum rather than restarting at 1. What is lost is only the no-reuse guarantee across that remount: delete the highest-numbered row, switch tabs, come back, add a row, and that number is issued a second time. Persisting the counter alongside the form's data would close it; nothing does today.
