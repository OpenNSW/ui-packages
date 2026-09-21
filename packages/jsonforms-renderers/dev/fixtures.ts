import type { JsonSchema, UISchemaElement } from '@jsonforms/core'

export type Fixture = {
  id: string
  name: string
  schema: JsonSchema
  uischema: UISchemaElement
  data?: Record<string, unknown>
}

// One fixture per renderer/component. Selecting a fixture loads its schema +
// uischema into the editors; both are live-editable from there.
export const fixtures: Fixture[] = [
  {
    id: 'text',
    name: 'Text',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A plain text field' },
        bio: { type: 'string', description: 'Multi-line via options.multi' },
      },
      required: ['name'],
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/name' },
        { type: 'Control', scope: '#/properties/bio', options: { multi: true } },
      ],
    } as UISchemaElement,
  },
  {
    id: 'number',
    name: 'Number',
    schema: {
      type: 'object',
      properties: {
        price: { type: 'number', description: 'Decimal value' },
        quantity: { type: 'integer', minimum: 0, description: 'Whole number ≥ 0' },
      },
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/price' },
        { type: 'Control', scope: '#/properties/quantity' },
      ],
    } as UISchemaElement,
  },
  {
    id: 'boolean',
    name: 'Boolean',
    schema: {
      type: 'object',
      properties: {
        agree: { type: 'boolean', description: 'Terms & conditions' },
      },
      required: ['agree'],
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/agree' }],
    } as UISchemaElement,
  },
  {
    id: 'radio',
    name: 'Radio',
    schema: {
      type: 'object',
      properties: {
        size: { type: 'string', enum: ['Small', 'Medium', 'Large'], description: 'Pick one' },
      },
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/size', options: { format: 'radio' } }],
    } as UISchemaElement,
  },
  {
    id: 'select',
    name: 'Select',
    schema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: ['Sri Lanka', 'India', 'Maldives'], description: 'Dropdown' },
      },
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/country' }],
    } as UISchemaElement,
  },
  {
    id: 'select-autocomplete',
    name: 'Select (Autocomplete)',
    schema: {
      type: 'object',
      properties: {
        autocompleteEnum: {
          type: 'string',
          enum: ['Sri Lanka', 'India', 'Maldives', 'Bangladesh', 'Nepal', 'Pakistan'],
          description: 'Type to filter, purely client-side — no remote service',
        },
      },
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/autocompleteEnum', options: { autocomplete: true } }],
    } as UISchemaElement,
  },
  {
    id: 'search-select-small',
    name: 'Search Select (Small list)',
    schema: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description: 'Fetches once on open — click to pick, no typing, no pagination',
          'x-search': { service: 'countries', mode: 'small-list' },
        },
      },
      required: ['country'],
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/country',
          options: { placeholder: 'Pick a country…' },
        },
      ],
    } as UISchemaElement,
    data: { country: 'au' },
  },
  {
    id: 'search-select-searchable',
    name: 'Search Select (Large searchable)',
    schema: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description: 'Fetches on open, then debounce-searches as you type — no pagination',
          'x-search': { service: 'countries', mode: 'large-searchable-list' },
        },
      },
      required: ['country'],
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/country',
          options: { placeholder: 'Search for a country…' },
        },
      ],
    } as UISchemaElement,
    data: { country: 'au' },
  },
  {
    id: 'search-select-paginated',
    name: 'Search Select (Large paginated)',
    schema: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description: 'Nothing loads until you search — cursor-paginated, 5 per page',
          'x-search': { service: 'countries', mode: 'large-paginated-list' },
        },
      },
      required: ['country'],
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/country',
          options: { placeholder: 'Search for a country…' },
        },
      ],
    } as UISchemaElement,
    data: { country: 'au' },
  },
  {
    id: 'search-select-params',
    name: 'Search Select (Fixed params)',
    schema: {
      type: 'object',
      properties: {
        asianCountry: {
          type: 'string',
          description: 'Same "countries" service as the other fixtures, scoped via x-search.params.continent',
          'x-search': { service: 'countries', mode: 'large-searchable-list', params: { continent: 'asia' } },
        },
        europeanCountry: {
          type: 'string',
          description: 'Same service again, scoped to a different fixed continent',
          'x-search': { service: 'countries', mode: 'large-searchable-list', params: { continent: 'europe' } },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/asianCountry',
          options: { placeholder: 'Search an Asian country…' },
        },
        {
          type: 'Control',
          scope: '#/properties/europeanCountry',
          options: { placeholder: 'Search a European country…' },
        },
      ],
    } as UISchemaElement,
  },
  {
    id: 'search-select-depends-on',
    name: 'Search Select (Depends on sibling)',
    schema: {
      type: 'object',
      properties: {
        continent: {
          type: 'string',
          description:
            'Pick a continent first. The country field below sends this value as params.parent to the same "countries" service.',
          oneOf: [
            { const: 'asia', title: 'Asia' },
            { const: 'europe', title: 'Europe' },
            { const: 'oceania', title: 'Oceania' },
            { const: 'north-america', title: 'North America' },
          ],
        },
        country: {
          type: 'string',
          description:
            'x-search.dependsOn: continent. Opens with "Select the related field first." until a continent is set; ' +
            'then the countries list is filtered to that continent. Changing continent clears this field.',
          'x-search': { service: 'countries', mode: 'small-list', dependsOn: 'continent' },
        },
      },
      required: ['continent', 'country'],
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/continent' },
        {
          type: 'Control',
          scope: '#/properties/country',
          options: { placeholder: 'Pick a country…' },
        },
      ],
    } as UISchemaElement,
  },
  {
    id: 'search-select-object',
    name: 'Search Select (Object shape)',
    schema: {
      type: 'object',
      properties: {
        country: {
          type: 'object',
          description:
            'Object-shaped x-search (type: "object") — submits { value, label } together, so the label ' +
            '("Australia" below) is already in the data and mount does not need to call resolve(). Clear and ' +
            're-pick to see onSelect write both fields.',
          'x-search': { service: 'countries', mode: 'large-searchable-list' },
          properties: {
            value: { type: 'string', minLength: 1 },
            label: { type: 'string' },
          },
          required: ['value'],
        },
      },
      required: ['country'],
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/country',
          options: { placeholder: 'Search for a country…' },
        },
      ],
    } as UISchemaElement,
    data: { country: { value: 'au', label: 'Australia' } },
  },
  {
    id: 'date',
    name: 'Date / Time',
    schema: {
      type: 'object',
      properties: {
        eventDate: { type: 'string', format: 'date', description: 'Date only (yyyy-MM-dd)' },
        appointment: { type: 'string', format: 'date-time', description: 'Date + time (RFC 3339)' },
        openingTime: { type: 'string', format: 'time', description: 'Time only (native picker)' },
      },
      required: ['eventDate'],
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/eventDate' },
        { type: 'Control', scope: '#/properties/appointment' },
        { type: 'Control', scope: '#/properties/openingTime' },
      ],
    } as UISchemaElement,
  },
  {
    id: 'file',
    name: 'File',
    schema: {
      type: 'object',
      properties: {
        avatar: { type: 'string', format: 'file', description: 'Single file' },
        attachments: {
          type: 'array',
          items: { type: 'string', format: 'file' },
          description: 'Multiple files',
        },
      },
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/avatar' },
        { type: 'Control', scope: '#/properties/attachments' },
      ],
    } as UISchemaElement,
  },
  {
    id: 'spreadsheet',
    name: 'Spreadsheet',
    schema: {
      type: 'object',
      properties: {
        budget: {
          type: 'object',
          description:
            "Upload dev/sample-files/spreadsheet-sample.xlsx (regenerate via generate-spreadsheet-sample.cjs) — a tea-auction report with data in rows 2-6, columns A (Date of Sale), B (Sale Code), C (BR Code), D (Lot No), E (Inv No), F (Garden Mark), G (Grade), H (Rate per KG), I (Qty in KG), J (Total Value Rs). The x-evaluate entries below exercise all 5 original functions (SUM/AVERAGE/MIN/MAX/COUNT) plus arithmetic, a nested function call, and multi-range pooling — the v2 additions (ROUND, IF, INDEX/MATCH, CONCATENATE) — and the fast-formula-parser + formulajs rewrite's expanded coverage: VLOOKUP, COUNTA, AND, and TEXTJOIN. Toggle x-spreadsheet.columnHeader/rowHeader to show row 1 / column A as headers instead of A/B/C, 1/2/3 — formulas still address raw cell coordinates either way. Set showSheet: false to hide the grid entirely and show only the computed values. Set sheetName to a sheet name to read a specific tab instead of the first one. The Download Spreadsheet button below the grid (x-spreadsheet-export, on the nested budget.sheet field) re-exports whatever this control persisted at data.budget.sheet — with columnHeader/rowHeader both false here, that's the plain matrix path, not the records path, so x-spreadsheet-export.columns isn't set on this fixture (it only relabels a records sheet's header row; a matrix has no header row to relabel).",
          'x-spreadsheet': {
            accept: '.xlsx,.xls,.csv',
            maxSize: 10485760,
            persistSheet: true,
            columnHeader: false,
            rowHeader: false,
            showSheet: true,
          },
          'x-evaluate': [
            { id: 'total_quantity', label: 'Total Quantity (KG)', expression: '=SUM(I2:I6)' },
            { id: 'total_value', label: 'Total Value (Rs)', expression: '=SUM(J2:J6)' },
            { id: 'average_rate_per_kg', label: 'Average Rate per KG', expression: '=AVERAGE(H2:H6)' },
            { id: 'highest_rate_per_kg', label: 'Highest Rate per KG', expression: '=MAX(H2:H6)' },
            { id: 'lowest_rate_per_kg', label: 'Lowest Rate per KG', expression: '=MIN(H2:H6)' },
            { id: 'number_of_lots', label: 'Number of Lots', expression: '=COUNT(I2:I6)' },
            { id: 'average_value_per_lot', label: 'Average Value per Lot', expression: '=SUM(J2:J6)/COUNT(J2:J6)' },
            {
              id: 'total_value_incl_commission',
              label: 'Total Value incl. 5% Commission',
              expression: '=SUM(J2:J6)*1.05',
            },
            { id: 'rate_spread', label: 'Rate Spread (Max-Min)', expression: '=MAX(H2:H6)-MIN(H2:H6)' },
            {
              id: 'quantity_incl_peak_lot_bonus',
              label: 'Quantity incl. Peak Lot Bonus (nested fn demo)',
              expression: '=SUM(I2:I6, MAX(I2:I6))',
            },
            {
              id: 'average_quantity_pooled',
              label: 'Average Quantity (pooled ranges demo)',
              expression: '=AVERAGE(I2:I4, I5:I6)',
            },
            {
              id: 'average_rate_per_kg_rounded',
              label: 'Average Rate per KG (rounded)',
              expression: '=ROUND(AVERAGE(H2:H6),2)',
            },
            { id: 'large_sale', label: 'Large Sale?', expression: '=IF(SUM(I2:I6)>20000,"Yes","No")' },
            {
              id: 'top_grade_by_quantity',
              label: 'Top Grade by Quantity',
              expression: '=INDEX(G2:G6,MATCH(MAX(I2:I6),I2:I6))',
            },
            {
              id: 'summary',
              label: 'Summary',
              expression: '=CONCATENATE("Total: ",SUM(I2:I6)," kg across ",COUNT(I2:I6)," lots")',
            },
            {
              id: 'grade_for_lot_l332',
              label: 'Grade for Lot L332 (VLOOKUP demo)',
              expression: '=VLOOKUP("L332",D2:G6,4,FALSE)',
            },
            { id: 'gardens_recorded', label: 'Gardens Recorded (COUNTA demo)', expression: '=COUNTA(F2:F6)' },
            {
              id: 'full_auction',
              label: 'Full Auction? (AND demo)',
              expression: '=IF(AND(COUNT(I2:I6)=5,MAX(H2:H6)>300),"All lots recorded, premium rate seen","Check data")',
            },
            {
              id: 'gardens_list',
              label: 'Gardens List (TEXTJOIN demo)',
              expression: '=TEXTJOIN(", ",TRUE,F2:F6)',
            },
          ],
          properties: {
            sheet: { type: 'array', 'x-spreadsheet-export': { fileName: 'budget-reexport.xlsx' } },
            // Keyed by each x-evaluate entry's id (see SpreadsheetValue),
            // not an array — must stay in lockstep with that type whenever
            // the persist shape changes again, or AJV rejects an otherwise
            // valid processMatrix write.
            derivations: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: {},
                  error: { type: 'string' },
                },
                required: ['label', 'value'],
              },
            },
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/budget' },
        { type: 'Control', scope: '#/properties/budget/properties/sheet' },
      ],
    } as UISchemaElement,
  },
  {
    id: 'computed-control',
    name: 'Computed Control',
    schema: {
      type: 'object',
      properties: {
        price_per_kg: { type: 'number', title: 'Price per KG' },
        quantity_kg: { type: 'number', title: 'Quantity (KG)' },
        discount: {
          type: 'number',
          title: 'Discount',
          description: 'Manually entered, optional — x-computed defaults this to 0 when left blank.',
        },
        total_value: {
          type: 'number',
          title: 'Total Value',
          description:
            'price * quantity - discount, via x-computed reading three plain sibling fields (no spreadsheet involved). Note: aliases must not be 1-3 letter all-alphabetic names like "qty" — see docs/computed-fields.md, they collide with the formula engine\'s own spreadsheet-column tokens.',
          'x-computed': {
            inputs: {
              price: 'price_per_kg',
              quantity: 'quantity_kg',
              discount_amount: { path: 'discount', default: 0 },
            },
            formula: 'price * quantity - discount_amount',
            decimals: 2,
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/price_per_kg' },
        { type: 'Control', scope: '#/properties/quantity_kg' },
        { type: 'Control', scope: '#/properties/discount' },
        { type: 'Control', scope: '#/properties/total_value' },
      ],
    } as UISchemaElement,
  },
  {
    id: 'computed-control-with-spreadsheet',
    name: 'Computed Control (with Spreadsheet)',
    schema: {
      type: 'object',
      properties: {
        sales_data: {
          type: 'object',
          title: 'Sales Data',
          description:
            "Upload dev/sample-files/sales-data-sample.xlsx (regenerate via generate-sales-data-sample.cjs). Row 1 of the file (Date, Item, Category, Quantity) is skipped unread — columnHeader just says a header row is there to skip; the declared columns list below is the actual, positional source of each record's keys. sales_data.sheet persists as one record per row — see docs/spreadsheet-value-shape.md.",
          'x-spreadsheet': {
            accept: '.xlsx,.xls,.csv',
            maxSize: 10485760,
            persistSheet: true,
            columnHeader: true,
            rowHeader: false,
            columns: [
              { id: 'date', label: 'Date' },
              { id: 'item', label: 'Item' },
              { id: 'category', label: 'Category' },
              { id: 'quantity', label: 'Quantity' },
            ],
          },
          'x-evaluate': [{ id: 'total_quantity', label: 'Total Quantity', expression: '=SUM(D2:D4)' }],
          properties: {
            sheet: { type: 'array' },
            derivations: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: {},
                  error: { type: 'string' },
                },
                required: ['label', 'value'],
              },
            },
          },
        },
        unit_price: {
          type: 'number',
          title: 'Unit Price',
          description: 'Manually entered — not a computed field.',
        },
        estimated_total: {
          type: 'number',
          title: 'Estimated Total',
          description:
            'quantity * price, via x-computed: quantity is a spreadsheet derivation (sales_data.derivations.total_quantity.value), price is the plain sibling field above.',
          'x-computed': {
            inputs: {
              quantity: 'sales_data.derivations.total_quantity.value',
              price: 'unit_price',
            },
            formula: 'quantity * price',
            decimals: 2,
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/sales_data' },
        { type: 'Control', scope: '#/properties/unit_price' },
        { type: 'Control', scope: '#/properties/estimated_total' },
      ],
    } as UISchemaElement,
  },
  {
    id: 'spreadsheet-row-header',
    name: 'Spreadsheet (rowHeader records)',
    schema: {
      type: 'object',
      properties: {
        quarterly_metrics: {
          type: 'object',
          title: 'Quarterly Metrics',
          description:
            "Upload dev/sample-files/quarterly-metrics-sample.xlsx (regenerate via generate-quarterly-metrics-sample.cjs) — column A holds each metric's name (Metric, Units Sold, Returns, Net Units — one per matrix ROW), columns B-D hold one quarter each. Column A's text is skipped unread (rowHeader: true, symmetric to columnHeader) — the declared rows list below, one entry per matrix row, is the actual positional source of each record's keys. The persisted sheet is the TRANSPOSED records shape: each quarter becomes one record — see docs/spreadsheet-value-shape.md. Contrast with 'Spreadsheet' and 'Computed Control (with Spreadsheet)', which both use columnHeader and persist one record per row instead.",
          'x-spreadsheet': {
            accept: '.xlsx,.xls,.csv',
            maxSize: 10485760,
            persistSheet: true,
            columnHeader: false,
            rowHeader: true,
            rows: [
              { id: 'metric', label: 'Metric' },
              { id: 'units_sold', label: 'Units Sold' },
              { id: 'returns', label: 'Returns' },
              { id: 'net_units', label: 'Net Units' },
            ],
          },
          'x-evaluate': [
            { id: 'total_units_sold', label: 'Total Units Sold (all quarters)', expression: '=SUM(B2:D2)' },
          ],
          properties: {
            sheet: { type: 'array' },
            derivations: { type: 'object' },
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/quarterly_metrics' }],
    } as UISchemaElement,
  },
  {
    id: 'spreadsheet-headerless-columns',
    name: 'Spreadsheet (headerless columns)',
    schema: {
      type: 'object',
      properties: {
        stock: {
          type: 'object',
          description:
            "Upload dev/sample-files/inventory-headerless-sample.xlsx (regenerate via generate-inventory-headerless-sample.cjs) — this file has NO header row at all; real data starts at row 1. columnHeader is absent/false, so nothing is skipped — row 1 maps straight to columns[0].id, row 2 to columns[0].id for the next record, and so on, purely by position. Contrast with the columnHeader: true fixtures above, which skip an actual header row in the file first. Column assignment is always positional, never by matching label text — see docs/spreadsheet-value-shape.md for the full validation matrix, including why an uploaded file's columns must already be in the declared order.",
          'x-spreadsheet': {
            accept: '.xlsx,.xls,.csv',
            maxSize: 10485760,
            persistSheet: true,
            columns: [
              { id: 'item', label: 'Item' },
              { id: 'category', label: 'Category' },
              { id: 'quantity', label: 'Quantity' },
              { id: 'unit_cost', label: 'Unit Cost' },
              { id: 'total_cost', label: 'Total Cost' },
            ],
          },
          'x-evaluate': [
            { id: 'total_quantity', label: 'Total Quantity', expression: '=SUM(C2:C5)' },
            { id: 'total_cost', label: 'Total Cost (Rs)', expression: '=SUM(E2:E5)' },
            { id: 'average_unit_cost', label: 'Average Unit Cost', expression: '=AVERAGE(D2:D5)' },
          ],
          properties: {
            sheet: { type: 'array' },
            derivations: { type: 'object' },
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/stock' }],
    } as UISchemaElement,
  },
  {
    id: 'spreadsheet-export-records',
    name: 'Spreadsheet Export (records)',
    schema: {
      type: 'object',
      properties: {
        salesRows: {
          type: 'array',
          description:
            "The x-spreadsheet-export issue #65 example, verbatim — a plain records array (not a SpreadsheetControl field; there's no upload/x-spreadsheet here at all) with a declared columns id/label list. Edit the data pane's salesRows array and click Download Spreadsheet: the workbook's header row should read the declared labels (Date of Sale, Amount), not the raw ids, and the column ORDER should match the declared list regardless of each record's own key order. Contrast with the 'Spreadsheet' fixture's Download Spreadsheet button below its upload, which re-exports whatever matrix SpreadsheetControl itself persisted — this fixture exercises the records+columns path standalone, the one the 'Spreadsheet' fixture's columnHeader: false data never touches.",
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              amount: { type: 'number' },
            },
          },
          'x-spreadsheet-export': {
            columns: [
              { id: 'date', label: 'Date of Sale' },
              { id: 'amount', label: 'Amount' },
            ],
            sheetName: 'Sales',
            fileName: 'sales-export.xlsx',
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/salesRows' }],
    } as UISchemaElement,
    data: {
      salesRows: [
        { date: '2026-09-01', amount: 120 },
        { date: '2026-09-02', amount: 80 },
      ],
    },
  },
  {
    id: 'xml',
    name: 'XML',
    schema: {
      type: 'object',
      properties: {
        sales_data: {
          type: 'object',
          title: 'Sales Data Document',
          description:
            "Upload dev/sample-files/sales-data-sample.xml. XmlControl parses any XML into a plain object and persists it as the field's own value, with no wrapper — no advance knowledge of the file's shape needed, and no configuration beyond how to parse it. Things to look for in the data pane: (1) each <sale> becomes a flat record; (2) Quantity is a NUMBER (500) while Date stays a STRING (01/06/2026 isn't numeric) — see the coercion table in docs/xml-control.md; (3) arrayPaths is belt and braces for this file, since three <sale> children parse as an array anyway — delete the entry, re-upload, and the array stays an array. It is load-bearing only when a repeated element appears exactly once, which is the case that would otherwise silently parse as a bare object. Also try removing the file with the ✕ in the header: the field must go back to pristine rather than failing validation.",
          'x-xml': {
            accept: '.xml,text/xml,application/xml',
            maxSize: 5242880,
            arrayPaths: ['salesData.sale'],
            removeNamespaces: false,
          },
          // No `properties`: the field's value IS the parsed document, an
          // arbitrary shape from an untrusted file, so `type: 'object'` above is
          // the only honest constraint — and the only affordable one, since AJV
          // runs with allErrors: true on every keystroke anywhere in the form.
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/sales_data' }],
    } as UISchemaElement,
  },
  {
    id: 'xml-writeto',
    name: 'XML → writeTo',
    schema: {
      type: 'object',
      properties: {
        import_doc: {
          type: 'object',
          title: 'Order Document',
          description:
            'Upload dev/sample-files/order-sample.xml. One upload fills this whole form: x-xml.writeTo maps values out of the parsed document onto other fields by ABSOLUTE data path, so it reaches both top-level fields and an item inside the array below — something a relative path could not do. Things to look for: (1) Reference Number is composed from four separate elements by a formula; (2) Account Reference keeps all 13 digits because `as: string` runs before anything can round it; (3) Priority arrives as the number 1 and is mapped to an enum value; (4) Ordered On is reformatted from 7/23/26; (5) Discount is <null/> in the file, which parses to an OBJECT — it lands as 0 via `default`, not as {}; (6) the three <line> elements fill the table, whose derivations then feed Net Total. persistDocument is false, so this field itself stores nothing: everything worth keeping was distributed, and storing the document too would duplicate every mapped value. Then try the SECOND importer, the one inside each order: that is writeBase: "parent", so its paths carry no index and it fills only the order it sits in. Add a second order and import into it — order 1 is left exactly as it was, which the absolute default could not do, since every item shares one schema and they would all write orders.0.*.',
          'x-xml': {
            accept: '.xml,text/xml,application/xml',
            maxSize: 5242880,
            arrayPaths: ['order.line'],
            persistDocument: false,
            writeTo: [
              {
                to: 'reference_no',
                inputs: {
                  ref_office: 'order.reference.office',
                  ref_serial: 'order.reference.serial',
                  ref_number: 'order.reference.number',
                  ref_year: 'order.reference.year',
                },
                // Aliases are snake_case on purpose: a 1-3 letter alphabetic
                // alias lexes as a spreadsheet column reference instead.
                formula: 'CONCATENATE(ref_office,"/",ref_serial,"/",ref_number,"/",ref_year)',
              },
              { from: 'order.customer.account_number', to: 'account_ref', as: 'string' },
              { from: 'order.header.priority', to: 'priority', map: { '1': 'high', '0': 'normal' }, default: 'normal' },
              { from: 'order.header.order_date', to: 'orders.0.ordered_on', as: 'date', format: 'M/D/YY' },
              { from: 'order.header.discount', to: 'orders.0.discount', as: 'number', default: 0 },
              { from: 'order.line', to: 'orders.0.lines.sheet' },
            ],
          },
        },
        reference_no: { type: 'string', title: 'Reference Number' },
        account_ref: { type: 'string', title: 'Account Reference' },
        priority: {
          type: 'string',
          title: 'Priority',
          oneOf: [
            { const: 'high', title: 'High' },
            { const: 'normal', title: 'Normal' },
          ],
        },
        orders: {
          type: 'array',
          title: 'Orders',
          items: {
            type: 'object',
            properties: {
              import_line: {
                type: 'object',
                title: 'Order Document',
                description:
                  'The same document, imported per order rather than for the form. writeBase: "parent" resolves each `to` against this order — the base x-computed.inputs already reads from — so the paths carry no index and one schema serves every item. `from` and arrayPaths are untouched: they address the document, which knows nothing about where in the form the control sits.',
                'x-xml': {
                  accept: '.xml,text/xml,application/xml',
                  maxSize: 5242880,
                  arrayPaths: ['order.line'],
                  persistDocument: false,
                  writeBase: 'parent',
                  writeTo: [
                    { from: 'order.header.order_date', to: 'ordered_on', as: 'date', format: 'M/D/YY' },
                    { from: 'order.header.discount', to: 'discount', as: 'number', default: 0 },
                    { from: 'order.line', to: 'lines.sheet' },
                  ],
                },
              },
              ordered_on: { type: 'string', format: 'date', title: 'Ordered On' },
              discount: { type: 'number', title: 'Discount' },
              lines: {
                type: 'object',
                title: 'Order Lines',
                // The importer writes `sheet` straight into this field and the
                // control evaluates it — no upload of its own needed, though
                // one still works. The importer's records already arrive
                // keyed by the real <line> element tag names (sku,
                // description, qty, unit_price, line_total, in that document
                // order) — declaring `columns` to match is what
                // recordsToMatrix's by-name reordering (utils/records.ts)
                // uses to keep those columns pinned regardless of what order
                // the records' own keys happen to arrive in.
                'x-spreadsheet': {
                  columnHeader: true,
                  columns: [
                    { id: 'sku', label: 'SKU' },
                    { id: 'description', label: 'Description' },
                    { id: 'qty', label: 'Qty' },
                    { id: 'unit_price', label: 'Unit Price' },
                    { id: 'line_total', label: 'Line Total' },
                  ],
                },
                'x-evaluate': [
                  { id: 'total_qty', label: 'Total Quantity', expression: '=SUM(C2:C4)' },
                  { id: 'total_value', label: 'Total Value', expression: '=SUM(E2:E4)' },
                  { id: 'average_price', label: 'Average Price', expression: '=SUM(E2:E4)/SUM(C2:C4)' },
                ],
                properties: { sheet: { type: 'array' }, derivations: { type: 'object' } },
              },
              net_total: {
                type: 'number',
                title: 'Net Total',
                'x-computed': {
                  inputs: {
                    total_value: { path: 'lines.derivations.total_value.value', default: 0 },
                    order_discount: { path: 'discount', default: 0 },
                  },
                  formula: 'total_value - order_discount',
                  decimals: 2,
                },
              },
            },
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/import_doc' },
        { type: 'Control', scope: '#/properties/reference_no' },
        { type: 'Control', scope: '#/properties/account_ref' },
        { type: 'Control', scope: '#/properties/priority' },
        {
          type: 'Control',
          scope: '#/properties/orders',
          options: {
            detail: {
              type: 'VerticalLayout',
              elements: [
                { type: 'Control', scope: '#/properties/import_line' },
                { type: 'Control', scope: '#/properties/ordered_on' },
                { type: 'Control', scope: '#/properties/discount' },
                { type: 'Control', scope: '#/properties/lines' },
                { type: 'Control', scope: '#/properties/net_total' },
              ],
            },
          },
        },
      ],
    } as UISchemaElement,
  },
  {
    id: 'array',
    name: 'Array (objects)',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'List of line items',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              qty: { type: 'integer', minimum: 1 },
            },
            required: ['description'],
          },
        },
      },
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/items' }],
    } as UISchemaElement,
    data: { items: [{ description: 'First item', qty: 1 }] },
  },
  {
    id: 'horizontal',
    name: 'Horizontal layout',
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
      },
    },
    uischema: {
      type: 'HorizontalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/firstName' },
        { type: 'Control', scope: '#/properties/lastName' },
      ],
    } as UISchemaElement,
  },
  {
    id: 'group',
    name: 'Group layout',
    schema: {
      type: 'object',
      properties: {
        street: { type: 'string' },
        city: { type: 'string' },
      },
    },
    uischema: {
      type: 'Group',
      label: 'Address',
      elements: [
        { type: 'Control', scope: '#/properties/street' },
        { type: 'Control', scope: '#/properties/city' },
      ],
    } as UISchemaElement,
  },
  {
    id: 'categorization',
    name: 'Categorization',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        notes: { type: 'string' },
      },
    },
    uischema: {
      type: 'Categorization',
      elements: [
        {
          type: 'Category',
          label: 'Personal',
          elements: [
            { type: 'Control', scope: '#/properties/name' },
            { type: 'Control', scope: '#/properties/email' },
          ],
        },
        {
          type: 'Category',
          label: 'More',
          elements: [{ type: 'Control', scope: '#/properties/notes', options: { multi: true } }],
        },
      ],
    } as UISchemaElement,
  },

  {
    id: 'label',
    name: 'Label',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    },
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Label', text: 'Section heading via Label renderer' },
        { type: 'Control', scope: '#/properties/name' },
      ],
    } as UISchemaElement,
  },
]
