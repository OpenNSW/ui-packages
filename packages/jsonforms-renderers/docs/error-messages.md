# Form error messages (`x-error-message`)

`x-error-message` on a schema node replaces AJV's text when a rule there fails. The form says what the rule means, instead of the user reading `must match pattern "^[0-9]{10}$"` or `must contain at least 1 valid item(s)`.

`x-` keywords are OpenNSW extensions to JSON Schema. Some choose a control (`x-search`, `x-xml`); others add rules or behaviour to an existing one (`x-file`, `x-template`, `x-error-message`).

## On a field

The message covers the field's own rules: `pattern`, `minLength`, `format`, `minimum` and so on.

```json
"phone": {
  "type": "string",
  "pattern": "^(\\+[0-9]{11}|[0-9]{10})$",
  "x-error-message": "Enter a 10-digit number, or + and 11 digits."
}
```

A field's own "is required" isn't covered: `required` is a rule of the object that lists the field, so "Phone is required" stays.

## On an `if`/`then`

A failed `if` is reported at the form's root, where no field shows it. Put the message on the `then` (or `else`): it covers every rule inside, including the block's own `required` list. Each error still shows on its own field.

```json
"if": {
  "properties": { "delivery_method": { "const": "courier" } },
  "required": ["delivery_method"]
},
"then": {
  "x-error-message": "Add a proof of address to the documents.",
  "required": ["documents"],
  "properties": {
    "documents": {
      "contains": {
        "properties": { "type": { "const": "Proof of address" } },
        "required": ["type"]
      }
    }
  }
}
```

| Data                            | Shown on Documents              |
| ------------------------------- | ------------------------------- |
| courier, `documents: [Invoice]` | the message                     |
| courier, `documents: []`        | the message                     |
| courier, no `documents`         | the message                     |
| not courier                     | nothing, the rule doesn't apply |

Put the message on the innermost `then`/`else` it describes. An outer `then` usually holds unrelated `required` rules too, and its message would replace theirs.

## Where a message applies

| The message is on                            | It covers                           |
| -------------------------------------------- | ----------------------------------- |
| A `then`, an `else` or an `allOf` entry      | Every rule inside it, at any depth  |
| Any other node: a field, an object, an array | Only the rules written on that node |

- **The nearest message wins.** A field's own message overrides one on the `then` around it, and an inner `then`'s overrides an outer one's.
- **A message on an object doesn't cover its fields.** `minProperties` on `consignee` gets the object's message; `minLength` on `consignee.name` doesn't. Put a message on each field instead.
- **Not inside a `contains`.** AJV also reports why each item didn't match a `contains`. Those errors keep AJV's text, so a non-matching row doesn't show the message meant for the list.
- **`$ref`.** AJV reports a rule inside a referenced schema at the referenced location, so put the message inside the referenced schema. A `$ref` to another schema file isn't followed.
- **Repeated lines show once.** Two rules that fail under one message show it once on the field.

## Relation to ArrayControl's `options.errorMessage`

The uischema option `options.errorMessage` on an array control still works, but only while the array is empty. `x-error-message` lives in the schema, covers any rule, and also works for a `then` block, which has no control of its own.

## For apps

The message is applied in the app's JSON Forms error translator. Call `schemaErrorMessage` first, and fall back to the existing translation when it returns `undefined`:

```ts
import { defaultErrorTranslator, type ErrorTranslator, type JsonSchema } from '@jsonforms/core'
import { schemaErrorMessage } from '@opennsw/jsonforms-renderers'

export const createErrorTranslator =
  (rootSchema: JsonSchema): ErrorTranslator =>
  (error, translate, uischema) =>
    schemaErrorMessage(error, rootSchema) ?? defaultErrorTranslator(error, translate, uischema)
```

Pass it as `i18n.translateError` on `<JsonForms>`.

- The message is shown as written; it isn't translated.
- Server-side validation that uses the same schema can ignore the keyword: it changes only the message shown, not what is valid.
