# @opennsw/jsonforms-renderers

[JSON Forms](https://jsonforms.io/) renderers for React, built on [Radix Themes](https://www.radix-ui.com/themes) and used by the OpenNSW portals. They cover text, number, boolean, radio, select, search-select, date, file, array, spreadsheet, XML and computed controls, and the layouts.

## Install

```sh
pnpm add @opennsw/jsonforms-renderers
```

Peer dependencies: `react` and `react-dom` `^19.2`, `@jsonforms/core` and `@jsonforms/react` `^3.2.1`, `@radix-ui/themes` `^3.2.1` and `@radix-ui/react-icons` `^1.3.2`.

## Use

```tsx
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import { radixRenderers } from '@opennsw/jsonforms-renderers'
import '@radix-ui/themes/styles.css'
import '@opennsw/jsonforms-renderers/styles.css'

export const Form = ({ schema, uischema, data, onChange }) => (
  <Theme>
    <JsonForms
      schema={schema}
      uischema={uischema}
      data={data}
      renderers={radixRenderers}
      onChange={({ data }) => onChange(data)}
    />
  </Theme>
)
```

## Documentation

Each control, its `x-*` schema options and examples are documented in the repository: [packages/jsonforms-renderers/docs](https://github.com/OpenNSW/ui-packages/tree/main/packages/jsonforms-renderers/docs).

- [Source and issues](https://github.com/OpenNSW/ui-packages)
- [Release notes](https://github.com/OpenNSW/ui-packages/releases?q=jsonforms-renderers)

## License

[Apache-2.0](https://github.com/OpenNSW/ui-packages/blob/main/LICENSE)
