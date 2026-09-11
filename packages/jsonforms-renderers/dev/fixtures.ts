import type { JsonSchema, UISchemaElement } from '@jsonforms/core'

export type Fixture = {
  id: string
  name: string
  schema: JsonSchema
  uischema: UISchemaElement
  data?: Record<string, unknown>
}

// ── Shared by the two Sales fixtures ──────────────────────────────────────
// "Sales (Excel upload)" and "Sales (XML -> sourcePath)" render the SAME three
// rows through the SAME options and the SAME formulas. The only thing that
// differs between them is where the rows come from, which is the whole point:
// every x-spreadsheet option except the source itself is supposed to behave
// identically either way, so any divergence you can see in the playground is a
// bug in the control. src/utils/sample-parity.test.ts pins the other half of
// that claim — that the .xlsx and .xml samples normalize to the same matrix.
const SALES_DISPLAY = { columnHeader: true, rowHeader: false, showSheet: true }

// Addresses work out the same for both sources: an uploaded sheet has its
// header in row 1, and a records source gains one at row 1 when it is
// flattened — so D2:D4 is the Quantity column of the three data rows either
// way. `broken` is deliberate: one entry failing must not blank the others.
const SALES_EVALUATE = [
  { id: 'total_quantity', label: 'Total Quantity', expression: '=SUM(D2:D4)' },
  { id: 'average_quantity', label: 'Average Quantity', expression: '=ROUND(AVERAGE(D2:D4),2)' },
  { id: 'line_count', label: 'Line Count', expression: '=COUNTA(B2:B4)' },
  { id: 'categories', label: 'Categories', expression: '=TEXTJOIN(", ",TRUE,C2:C4)' },
  { id: 'broken', label: 'Broken Reference (expects #REF!)', expression: '=SUM(Z2:Z4)' },
]

// The persisted derivations map: keyed by each x-evaluate id, with the value
// shape SpreadsheetValue declares.
const DERIVATIONS_SCHEMA = {
  type: 'object',
  additionalProperties: {
    type: 'object',
    properties: {
      label: { type: 'string' },
      // Empty schema on purpose: a result may be a number, string, boolean, or
      // null when the entry errored.
      value: {},
      error: { type: 'string' },
    },
    required: ['label', 'value'],
  },
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
            "Upload dev/sample-files/spreadsheet-sample.xlsx (regenerate via generate-spreadsheet-sample.cjs) — a tea-auction report with data in rows 2-6, columns A (Date of Sale), B (Sale Code), C (BR Code), D (Lot No), E (Inv No), F (Garden Mark), G (Grade), H (Rate per KG), I (Qty in KG), J (Total Value Rs). The x-evaluate entries below exercise all 5 original functions (SUM/AVERAGE/MIN/MAX/COUNT) plus arithmetic, a nested function call, and multi-range pooling — the v2 additions (ROUND, IF, INDEX/MATCH, CONCATENATE) — and the fast-formula-parser + formulajs rewrite's expanded coverage: VLOOKUP, COUNTA, AND, and TEXTJOIN. Toggle x-spreadsheet.columnHeader/rowHeader to show row 1 / column A as headers instead of A/B/C, 1/2/3 — formulas still address raw cell coordinates either way. Set showSheet: false to hide the grid entirely and show only the computed values. Set sheetName to a sheet name to read a specific tab instead of the first one.",
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
            sheet: { type: 'array' },
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
      elements: [{ type: 'Control', scope: '#/properties/budget' }],
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
            "Upload dev/sample-files/sales-data-sample.xlsx (regenerate via generate-sales-data-sample.cjs). Since columnHeader is true, sales_data.sheet persists as one record per row (keyed by row 1's headers), not a raw matrix — see docs/spreadsheet-value-shape.md.",
          'x-spreadsheet': { accept: '.xlsx,.xls,.csv', maxSize: 10485760, persistSheet: true, ...SALES_DISPLAY },
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
            "Upload dev/sample-files/quarterly-metrics-sample.xlsx (regenerate via generate-quarterly-metrics-sample.cjs) — column A holds each metric's name (row header), columns B-D hold one quarter each. With rowHeader: true and columnHeader: false, the persisted sheet is the TRANSPOSED records shape: each quarter becomes one record, keyed by column A's metric names — see docs/spreadsheet-value-shape.md. Contrast with 'Spreadsheet' and 'Computed Control (with Spreadsheet)', which both use columnHeader and persist one record per row instead.",
          'x-spreadsheet': {
            accept: '.xlsx,.xls,.csv',
            maxSize: 10485760,
            persistSheet: true,
            columnHeader: false,
            rowHeader: true,
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
    id: 'sales-upload',
    name: 'Sales (Excel upload)',
    schema: {
      type: 'object',
      properties: {
        sales_totals: {
          type: 'object',
          title: 'Sales Totals',
          description:
            "Upload dev/sample-files/sales-data-sample.xlsx. The twin of 'Sales (XML -> sourcePath)': same rows, same display options, same formulas — the only difference between the two fixtures is that this one reads its rows from an uploaded file and that one reads them from a sibling field. Open both and compare: all five computed values must match exactly, #REF! included, and so must every cell of the table. The ONE thing that still differs is the leftmost row-number column — blank here, 1/2/3 there — because an uploaded sheet renders through the matrix preview (where columnHeader suppresses the numbering) while a records source renders through the records preview, which ignores columnHeader entirely. That is the last un-orthogonal option and it is tracked as its own change. Expected here: Total Quantity 1000, Average Quantity 333.33, Line Count 3, Categories 'Hardware, Hardware, Accessories'. In live data, note `sheet` IS persisted — persistSheet defaults to true for an upload, because this field holds the only copy of the rows.",
          'x-spreadsheet': { ...SALES_DISPLAY },
          'x-evaluate': SALES_EVALUATE,
          properties: {
            sheet: { type: 'array' },
            derivations: DERIVATIONS_SCHEMA,
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/sales_totals' }],
    } as UISchemaElement,
  },
  {
    id: 'xml-spreadsheet',
    name: 'Sales (XML -> sourcePath)',
    schema: {
      type: 'object',
      properties: {
        sales_document: {
          type: 'object',
          title: 'Sales Data Document',
          description:
            'Upload dev/sample-files/sales-data-sample.xml. This field only PARSES — its value is the parsed document itself, and it computes nothing.',
          'x-xml': {
            accept: '.xml,text/xml,application/xml',
            maxSize: 5242880,
            arrayPaths: ['salesData.sale'],
          },
        },
        sales_totals: {
          type: 'object',
          title: 'Sales Totals',
          description:
            "Formulas over the array the field above parsed, reached by sourcePath — no upload of its own. The source can be ANY 2-D array or array of objects in form data, not just an XML document: an ArrayControl's items or another spreadsheet's `sheet` work identically. Records are flattened to a header row plus one row per record, so field names are row 1 and the data starts at row 2 — A=Date, B=Item, C=Category, D=Quantity. The twin fixture 'Sales (Excel upload)' runs the same rows through the same options from a file instead. Every computed value and every data cell must match; only the leftmost row-number column differs so far, since this records source renders through a preview branch that does not yet honour columnHeader. Things to try: (1) before uploading, this reads \"No data available yet\" and writes nothing to form data; (2) after uploading, live data holds the parsed document above and only `derivations` here — the rows are not copied, because persistSheet defaults to false when another field owns them; (3) add persistSheet: true and a shaped `sheet` appears alongside, identical to the twin's; (4) the 'broken' entry reports #REF! while every other entry still computes; (5) point sourcePath at something that isn't rows, e.g. sales_document.salesData, to see the invalid-source message.",
          // Identical to the 'Sales (Excel upload)' fixture except for this one
          // added key. Everything else about the two is shared verbatim.
          'x-spreadsheet': { ...SALES_DISPLAY, sourcePath: 'sales_document.salesData.sale' },
          'x-evaluate': SALES_EVALUATE,
          // No `sheet` here: persistSheet defaults to false for a path source,
          // since the rows already live under sales_document. Set it to true
          // and a shaped copy appears alongside derivations.
          properties: {
            derivations: DERIVATIONS_SCHEMA,
          },
        },
        estimated_total: {
          type: 'number',
          title: 'Estimated Total',
          description:
            'x-computed reading a derivation from the field above — total_quantity * 2. Demonstrates the full decoupled chain: XmlControl parses, SpreadsheetControl evaluates, ComputedControl consumes.',
          'x-computed': {
            inputs: { quantity: 'sales_totals.derivations.total_quantity.value' },
            formula: 'quantity * 2',
            decimals: 2,
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/sales_document' },
        { type: 'Control', scope: '#/properties/sales_totals' },
        { type: 'Control', scope: '#/properties/estimated_total' },
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
