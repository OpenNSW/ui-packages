# SelectControl

`SelectControl` renders a dropdown for a field with a fixed list of options, given as
`enum` or as `oneOf` entries of `{ const, title }`. The trader sees the `title`; what the
form stores depends on the field's `type`.

## Storing the code (`type: "string"`)

The usual shape. The form stores the selected `const`, as a string.

```jsonc
{
  "commodity": {
    "type": "string",
    "title": "Commodity",
    "oneOf": [
      { "const": "7", "title": "Cinnamon quill" },
      { "const": "8", "title": "Cinnamon leaf oil" },
    ],
  },
}
```

Picking "Cinnamon quill" stores `"7"`.

## Storing the code and its title (`type: "object"`)

Declare the field as an object and move the list under `properties.value`. The form then
stores `{ value, label }`: the `const` and the `title` the trader saw. Anything that
reads the submission later, such as a status template or a certificate, can show the
`label` without going back to the form's schema for it.

```jsonc
{
  "commodity": {
    "type": "object",
    "title": "Commodity",
    "properties": {
      "value": {
        "type": "string",
        "oneOf": [
          { "const": "7", "title": "Cinnamon quill" },
          { "const": "8", "title": "Cinnamon leaf oil" },
        ],
      },
      "label": { "type": "string" },
    },
    "required": ["value"],
  },
}
```

Picking "Cinnamon quill" stores `{ "value": "7", "label": "Cinnamon quill" }`. It is the
same shape an object-typed `x-search` field stores (see
[search-control-design.md](search-control-design.md)).

- The list stays under `value`, so validation still checks that the stored code is one
  of the options. `const` is stored as-is, so a `value` of `"type": "integer"` with
  integer consts works too.
- `label` is the `title` at the time of picking, or the value itself for a plain `enum`.
  The control shows the stored `label`, as an object-typed `x-search` field does, so a
  saved form keeps showing what the trader picked even if the title is renamed or the
  option is removed later.
- A record saved while the field was still `type: "string"` holds a bare code. The
  control shows it by its option's title and stores `{ value, label }` the next time it
  is changed.
- Clearing the field removes it, as with the string shape.

Switching a field from `type: "string"` to `type: "object"` changes what it stores, so
whatever reads it has to change with it. A workflow condition reads `.value`
(`form.commodity.value == '7'`), a uischema rule scopes to
`#/properties/commodity/properties/value`, and a template prints `.label`. Fields left as
`type: "string"` are unaffected.

## Type to filter (`options.autocomplete`)

Set `options.autocomplete: true` on the uischema Control to replace the dropdown with a
text box that filters the options as the trader types. It works with either shape and
stores the same values.

```jsonc
{ "type": "Control", "scope": "#/properties/commodity", "options": { "autocomplete": true } }
```

`options.placeholder` sets the text shown while nothing is selected (default
"Select an option").

For options loaded from a service rather than listed in the schema, use
`SearchSelectControl` (`x-search`) instead.
