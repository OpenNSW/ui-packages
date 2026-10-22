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

## No past days (`formatMinimum`)

`formatMinimum` on a `date` or `date-time` property is Ajv's earliest-day keyword. A fixed day works with JsonForms' `createAjv()` alone. `"today"` means the current local calendar day, and the app's Ajv has to be taught that word before any schema is compiled:

```ts
import { createAjv } from '@jsonforms/core'
import { withRelativeDates } from '@opennsw/jsonforms-renderers'

export const ajv = withRelativeDates(createAjv({ useDefaults: true }))
```

Pass that instance to `<JsonForms ajv={ajv} />`. Without the wrap, `"today"` fails every value. A fixed day such as `"2026-01-01"` works either way.

```json
"estimated_shipment_date": {
  "type": "string",
  "format": "date",
  "title": "Estimated Shipment Date",
  "formatMinimum": "today"
}
```

`DateControl` sets the picker's `min` from that keyword, resolving `"today"` to the current day, so an earlier day cannot be selected. Whatever is typed is stored, including each padded year a browser emits while the year is typed. Ajv then reports a past day through the field's normal error, which blocks submit. The message is "Estimated Shipment Date must be today or later", or "on or after 1 Jan 2026" for a fixed day.

`"today"` is the local calendar day in the browser. A server that validates the same schema has to resolve `"today"` the same way, in the timezone it and the browser agree on.
