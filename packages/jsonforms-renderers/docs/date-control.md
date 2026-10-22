# Date and time (`DateControl`)

`DateControl` renders JSON Schema `string` fields with `format` of `date`, `time`, or `date-time`, using native browser pickers.

See the `date` fixture in `dev/fixtures.ts` for a runnable example (`eventDate`, `appointment`, `openingTime`, `closingTime`).

## Formats

| Schema `format` | Stored value                                | UI                                                       |
| --------------- | ------------------------------------------- | -------------------------------------------------------- |
| `date`          | `YYYY-MM-DD`                                | Native date input                                        |
| `time`          | RFC 3339 `HH:MM:SS`                         | Native time input                                        |
| `date-time`     | RFC 3339 date-time (seconds + local offset) | Date and time inputs side by side, sharing width equally |

`time` and `date-time` share the same native time input. With `date` alone the date input expands to the full control width.

## Stored time is always `HH:MM:SS`

AJV's `format: "time"` is RFC 3339, which requires seconds. Native `<input type="time">` with minute precision (the default) emits `HH:MM`. `DateControl` pads that to `HH:MM:SS` before writing form data (`14:30` → `14:30:00`) via [`utils/time.ts`](../src/utils/time.ts). Clearing the picker still clears the field.

Artifact schemas that declare `format: "time"` do not need to change.

## Seconds spinner (`options.showSeconds`)

The seconds spinner is **opt-in**. Set `options.showSeconds: true` on the **Control** in the uischema — it applies to both `time` and `date-time`:

```json
{
  "type": "Control",
  "scope": "#/properties/proposed_inspection_time",
  "options": { "showSeconds": true }
}
```

| `showSeconds`     | Picker                               | Stored value                                                        |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------- |
| omitted / `false` | Hour and minute only (`step=60`)     | Seconds default to `00`                                             |
| `true`            | Hour, minute, and seconds (`step=1`) | Seconds as picked; still `00` if the user only sets hour and minute |

A form that omits `showSeconds` keeps the hour-and-minute picker and still submits a valid `HH:MM:SS` string.

## Earliest day (`formatMinimum`)

A `date` or `date-time` field refuses earlier days by setting Ajv's `formatMinimum`. `"today"` is the trader's local calendar day. Any such field opts in the same way:

```json
"estimated_shipment_date": {
  "type": "string",
  "format": "date",
  "title": "Estimated Shipment Date",
  "formatMinimum": "today"
}
```

The picker will not offer an earlier day, and a typed earlier day is not stored. Submit rejects one too. JsonForms' Ajv already has `formatMinimum`; `addDateBounds` makes the bound `"today"` mean the local day:

```ts
import { createAjv } from '@jsonforms/core'
import { addDateBounds } from '@opennsw/jsonforms-renderers'

const ajv = addDateBounds(createAjv())
```

A `YYYY-MM-DD` bound is that fixed day instead. A `time` field ignores `formatMinimum`.
