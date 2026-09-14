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
    id: 'sltb-blend-sheet',
    name: 'SLTB Blend Sheet (demo)',
    // Kept in lockstep with tnsw/sltb/1-application/traderinput_jsonform.json
    // in one-trade-artifacts — this is where that artifact gets looked at
    // before it ships, so a divergence here is a demo of the wrong thing.
    schema: {
      type: 'object',
      required: ['blendsheet_data'],
      properties: {
        blendsheet_data: {
          type: 'array',
          title: 'Blend Sheets',
          description:
            'Add one entry per blend sheet; each entry mirrors one printed SLTB Blend Sheet. Upload dev/sample-files/blend-sheet-31490.xml into a sheet\'s Import control, then add a second sheet and import into that one too. Things to look for: (1) writeBase: "parent" means the second import fills only the second sheet — the first is untouched, which absolute paths could not do since every item shares one schema; (2) CUSDEC Reg No. is composed from four elements by a formula; (3) the TIN keeps all 13 digits because `as: string` runs before anything can round it; (4) Logo Lion arrives as the number 1 and maps to an enum value; (5) Date of Blend is reformatted from 7/23/26 — with M/D/YY, not M/DD/YY, which fails on any single-digit day and is treated as absent; (6) Blend Gain, Flavors and both shipped quantities are <null/> in the file, which parses to an OBJECT, and land as 0 via `default`; (7) the 25 <Particulars_of_sale> elements fill the sale table, whose derivations read 1916.9443792536963 / 8522 / 16336200 and then feed Total and Blend Balance C/F.',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              import_blend_sheet: {
                type: 'object',
                title: 'Import Blend Sheet XML',
                description:
                  'Upload the blend sheet XML to fill this blend sheet automatically. Values can be corrected afterwards.',
                'x-xml': {
                  accept: '.xml,text/xml,application/xml',
                  maxSize: 5242880,
                  arrayPaths: ['BLEND_SHEET.Particulars_of_sale'],
                  persistDocument: false,
                  writeBase: 'parent',
                  writeTo: [
                    {
                      from: 'BLEND_SHEET.Country',
                      to: 'private_treaty_to_be_exported',
                      as: 'string',
                    },
                    {
                      from: 'BLEND_SHEET.Exporter.registration_number',
                      to: 'exporter_registration_no',
                      as: 'string',
                    },
                    {
                      from: 'BLEND_SHEET.Exporter.TIN_number',
                      to: 'exporter_tin',
                      as: 'string',
                    },
                    {
                      to: 'cusdec_number',
                      inputs: {
                        cusdec_office: 'BLEND_SHEET.CUSDEC_info.CUSDEC_office',
                        cusdec_year: 'BLEND_SHEET.CUSDEC_info.CUSDEC_year',
                        cusdec_serial: 'BLEND_SHEET.CUSDEC_info.CUSDEC_serial',
                        cusdec_no: 'BLEND_SHEET.CUSDEC_info.CUSDEC_number',
                      },
                      formula: 'CONCATENATE(cusdec_office," ",cusdec_year," ",cusdec_serial," ",cusdec_no)',
                    },
                    {
                      from: 'BLEND_SHEET.Blend.Blend_number',
                      to: 'blend_no',
                      as: 'string',
                    },
                    {
                      from: 'BLEND_SHEET.Blend.Quantity_export',
                      to: 'quality_to_be_exported',
                      as: 'number',
                    },
                    {
                      from: 'BLEND_SHEET.Blend.Average_rate',
                      to: 'avg_rate_per_kg',
                      as: 'number',
                    },
                    {
                      from: 'BLEND_SHEET.Blend.Blend_grade',
                      to: 'grade_or_standard',
                      as: 'string',
                    },
                    {
                      from: 'BLEND_SHEET.Blend.Average_FOB',
                      to: 'fob_avg',
                      as: 'number',
                    },
                    {
                      from: 'BLEND_SHEET.Blend.Blend_date',
                      to: 'date_of_blend',
                      as: 'date',
                      format: 'M/D/YY',
                    },
                    {
                      from: 'BLEND_SHEET.Blend.Lion_logo',
                      to: 'lion_logo_requested',
                      map: {
                        '1': 'yes',
                        '0': 'no',
                      },
                      default: 'no',
                    },
                    {
                      from: 'BLEND_SHEET.Particulars_of_sale',
                      to: 'sales.sheet',
                    },
                    {
                      from: 'BLEND_SHEET.Sample.Remarks',
                      to: 'remarks',
                      as: 'string',
                      default: '',
                    },
                    {
                      from: 'BLEND_SHEET.Sample.Sample_date',
                      to: 'sample_rediness_date',
                      as: 'date',
                      format: 'M/D/YY',
                    },
                    {
                      from: 'BLEND_SHEET.Sample.Sample_Warehouse',
                      to: 'warehouse_address',
                      as: 'string',
                    },
                    {
                      from: 'BLEND_SHEET.Total.Blend_gain',
                      to: 'blend_gain_determined',
                      as: 'number',
                      default: 0,
                    },
                    {
                      from: 'BLEND_SHEET.Total.Flavor',
                      to: 'flavors',
                      as: 'number',
                      default: 0,
                    },
                    {
                      from: 'BLEND_SHEET.Total.Average_value',
                      to: 'avg_value_per_kg',
                      as: 'number',
                    },
                    {
                      from: 'BLEND_SHEET.Total.Ship_import',
                      to: 'quantity_to_be_shipped_imported',
                      as: 'number',
                      default: 0,
                    },
                    {
                      from: 'BLEND_SHEET.Total.Ship_local',
                      to: 'quantity_to_be_shipped_local',
                      as: 'number',
                      default: 0,
                    },
                  ],
                },
              },
              form: {
                type: 'string',
                title: 'Form',
                description: 'Printed top-right of the blend sheet. Not carried by the XML — select manually.',
                default: '100_local',
                oneOf: [
                  {
                    const: '100_local',
                    title: '100% LOCAL',
                  },
                  {
                    const: 'local_and_imported',
                    title: 'LOCAL+IMPORTED',
                  },
                  {
                    const: 'imported',
                    title: 'IMPORTED',
                  },
                ],
              },
              blendsheet_no: {
                type: 'string',
                title: 'Blend Sheet No.',
                description: 'Not carried by the XML — enter manually.',
                example: '2026/34254',
              },
              exporter_registration_no: {
                type: 'string',
                title: 'Exporter Reg. No.',
                description: 'SLTB exporter registration number as printed on the blend sheet.',
                example: 'R/473',
              },
              exporter_tin: {
                type: 'string',
                title: 'Exporter TIN No.',
                description: 'Should be automatically fetched',
                example: '1140117387000',
              },
              private_treaty_to_be_exported: {
                type: 'string',
                title: 'To Be Exported To',
                description: 'Destination country named in the blend sheet declaration.',
                example: 'Jordan',
              },
              cusdec_number: {
                type: 'string',
                title: 'CUSDEC Reg No.',
                description: 'Office, year, serial and number as printed on the blend sheet.',
                example: 'CBEX1 2026 E 48428',
              },
              blend_no: {
                type: 'string',
                title: 'Blend No.',
                example: '26/1386',
              },
              quality_to_be_exported: {
                type: 'number',
                title: 'Quantity to be Exported (KGs)',
                example: 16128,
              },
              avg_rate_per_kg: {
                type: 'number',
                title: 'Avg Rate Per KG',
                example: 1054.56,
              },
              grade_or_standard: {
                type: 'string',
                title: 'Grade/Standard',
                description: 'Blend grade as declared, e.g. BOPF, BOP, PF1, FGS1, PF.',
                example: 'BOPF',
              },
              fob_avg: {
                type: 'number',
                title: 'FOB Avg',
                example: 2359,
              },
              date_of_blend: {
                type: 'string',
                format: 'date',
                title: 'Date of Blend',
                example: '2026-07-23',
              },
              lion_logo_requested: {
                type: 'string',
                title: 'Logo Lion',
                description: "Select 'Yes' if this blend sheet requires SLTB Lion Logo certification.",
                default: 'no',
                oneOf: [
                  {
                    const: 'no',
                    title: 'No — Lion Logo not required',
                  },
                  {
                    const: 'yes',
                    title: 'Yes — Apply for Lion Logo (USED)',
                  },
                ],
              },
              sales: {
                type: 'object',
                title: 'PARTICULAR OF SALE',
                description:
                  'Please upload the official sale sheet containing the detailed blend analysis (.xlsx, .xls, .csv)',
                'x-spreadsheet': {
                  accept: '.xlsx,.xls,.csv',
                  maxSize: 10485760,
                  persistSheet: true,
                  columnHeader: true,
                },
                'x-evaluate': [
                  {
                    id: 'average_value_per_kg',
                    label: 'Average Value Per KG (Total Value ÷ Total Quantity)',
                    expression: '=SUM(J2:J10000)/SUM(I2:I10000)',
                  },
                  {
                    id: 'total_sales_quantity',
                    label: 'Total Sales Quantity (KG)',
                    expression: '=SUM(I2:I10000)',
                  },
                  {
                    id: 'total_sales_value',
                    label: 'Total Sales Value (LKR)',
                    expression: '=SUM(J2:J10000)',
                  },
                ],
                properties: {
                  sheet: {
                    type: 'array',
                  },
                  derivations: {
                    type: 'object',
                  },
                },
              },
              imported_tea: {
                type: 'object',
                title: 'PARTICULAR OF IMPORTED TEA',
                description:
                  'Please upload the official import sheet containing the detailed import analysis (.xlsx, .xls, .csv)',
                'x-spreadsheet': {
                  accept: '.xlsx,.xls,.csv',
                  maxSize: 10485760,
                  persistSheet: true,
                  columnHeader: true,
                },
                'x-evaluate': [
                  {
                    id: 'total_import_quantity',
                    label: 'Total Import Quantity (KG)',
                    expression: '=SUM(F2:F10000)',
                  },
                  {
                    id: 'total_import_value',
                    label: 'Total Import Value (LKR)',
                    expression: '=SUM(G2:G10000)',
                  },
                ],
                properties: {
                  sheet: {
                    type: 'array',
                  },
                  derivations: {
                    type: 'object',
                  },
                },
              },
              blend_balances: {
                type: 'object',
                title: 'PARTICULARS OF BLEND BALANCES USED (IF APPLICABLE)',
                description:
                  'Please upload the official blend balances sheet containing the detailed blend analysis (.xlsx, .xls, .csv)',
                'x-spreadsheet': {
                  accept: '.xlsx,.xls,.csv',
                  maxSize: 10485760,
                  persistSheet: true,
                  columnHeader: true,
                },
                'x-evaluate': [
                  {
                    id: 'total_blend_balances',
                    label: 'Total Blend Balances (KG)',
                    expression: '=SUM(C2:C10000)',
                  },
                  {
                    id: 'total_blend_gain',
                    label: 'Total Blend Gain (KG)',
                    expression: '=SUM(D2:D10000)',
                  },
                ],
                properties: {
                  sheet: {
                    type: 'array',
                  },
                  derivations: {
                    type: 'object',
                  },
                },
              },
              total_blend_balances_and_gain: {
                type: 'number',
                title: 'Total (Blend Balances & Gain) (KG)',
                description: 'Total Blend Balances and Gain = Total Blend Balances + Total Blend Gain',
                'x-computed': {
                  inputs: {
                    blend_balances: {
                      path: 'blend_balances.derivations.total_blend_balances.value',
                      default: 0,
                    },
                    blend_gain: {
                      path: 'blend_balances.derivations.total_blend_gain.value',
                      default: 0,
                    },
                  },
                  formula: 'blend_balances + blend_gain',
                  decimals: 4,
                },
              },
              remarks: {
                type: 'string',
                title: 'Remarks',
                description: 'This value need to enter manually',
                example: 'This is a sample remark for the blend sheet.',
              },
              sample_rediness_date: {
                type: 'string',
                format: 'date',
                title: 'Sample Readiness Date',
                description: 'This value need to enter manually',
                example: '2026-07-24',
              },
              warehouse_address: {
                type: 'string',
                title: 'Warehouse Address',
                description: 'This value need to enter manually',
                example: 'Quick Tea (Pvt) Ltd, 119, 119/1 Attampolawatte, Mabole, Wattala',
              },
              blend_gain_determined: {
                type: 'number',
                title: 'Blend Gain Determined (KG)',
                description: 'This value need to enter manually',
                example: 0,
              },
              flavors: {
                type: 'number',
                title: 'Flavors (KG)',
                description: 'This value need to enter manually',
                example: 0,
              },
              total: {
                type: 'number',
                title: 'Total (KG)',
                description: 'Total Quantity = Total Sales + Total Imported + Total Blend Balances and Gain',
                'x-computed': {
                  inputs: {
                    sales_quantity: {
                      path: 'sales.derivations.total_sales_quantity.value',
                      default: 0,
                    },
                    imported_quantity: {
                      path: 'imported_tea.derivations.total_import_quantity.value',
                      default: 0,
                    },
                    total_blend_balances_and_gain: {
                      path: 'total_blend_balances_and_gain',
                      default: 0,
                    },
                  },
                  formula: 'sales_quantity + imported_quantity + total_blend_balances_and_gain',
                  decimals: 4,
                },
              },
              avg_value_per_kg: {
                type: 'number',
                title: 'Avg Value Per KG',
                description:
                  'Declared average value per KG as printed in the blend sheet footer. May differ from the value-weighted average derived from the sale table.',
                example: 1054.56,
              },
              quantity_to_be_shipped_imported: {
                type: 'number',
                title: 'Quantity to be Shipped — Imported (KG)',
                description: 'This value need to enter manually',
                example: 0,
              },
              quantity_to_be_shipped_local: {
                type: 'number',
                title: 'Quantity to be Shipped — Local (KG)',
                description: 'This value need to enter manually',
                example: 16128,
              },
              blend_balance: {
                type: 'number',
                title: 'Blend Balance C/F (KG)',
                description: 'Blend Balance = Total Quantity - Quantity to be Exported',
                'x-computed': {
                  inputs: {
                    total_quantity: {
                      path: 'total',
                      default: 0,
                    },
                    quality_to_be_exported: {
                      path: 'quality_to_be_exported',
                      default: 0,
                    },
                  },
                  formula: 'total_quantity - quality_to_be_exported',
                  decimals: 4,
                },
              },
            },
            required: [
              'exporter_registration_no',
              'exporter_tin',
              'cusdec_number',
              'quality_to_be_exported',
              'avg_rate_per_kg',
              'grade_or_standard',
              'fob_avg',
              'date_of_blend',
              'sales',
              'total_blend_balances_and_gain',
              'total',
              'blend_balance',
            ],
          },
        },
      },
    } as unknown as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/blendsheet_data',
          options: {
            detail: {
              type: 'VerticalLayout',
              elements: [
                {
                  type: 'Control',
                  scope: '#/properties/import_blend_sheet',
                },
                {
                  type: 'Group',
                  elements: [
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        {
                          type: 'VerticalLayout',
                          elements: [],
                        },
                        {
                          type: 'Control',
                          scope: '#/properties/form',
                        },
                      ],
                    },
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        {
                          type: 'VerticalLayout',
                          elements: [
                            {
                              type: 'Control',
                              scope: '#/properties/blendsheet_no',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/exporter_registration_no',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/exporter_tin',
                            },
                          ],
                        },
                        {
                          type: 'VerticalLayout',
                          elements: [
                            {
                              type: 'Label',
                              text: 'PARTICULARS OF THE TEA BOUGHT AT THE COLOMBO TEA AUCTION AND PRIVATE TREATY TO BE EXPORTED TO',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/private_treaty_to_be_exported',
                            },
                            {
                              type: 'Label',
                              text: 'AS UNBLENDED STRAIGHT LINES/BLEND BULK/PACKETS/TEA IN TEA BAGS',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'Group',
                  elements: [
                    {
                      type: 'Control',
                      scope: '#/properties/cusdec_number',
                    },
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        {
                          type: 'Control',
                          scope: '#/properties/blend_no',
                        },
                        {
                          type: 'Control',
                          scope: '#/properties/quality_to_be_exported',
                        },
                      ],
                    },
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        {
                          type: 'Control',
                          scope: '#/properties/avg_rate_per_kg',
                        },
                        {
                          type: 'Control',
                          scope: '#/properties/grade_or_standard',
                        },
                      ],
                    },
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        {
                          type: 'Control',
                          scope: '#/properties/fob_avg',
                        },
                        {
                          type: 'Control',
                          scope: '#/properties/date_of_blend',
                        },
                      ],
                    },
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        {
                          type: 'Control',
                          scope: '#/properties/lion_logo_requested',
                        },
                        {
                          type: 'VerticalLayout',
                          elements: [],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'Control',
                  scope: '#/properties/sales',
                },
                {
                  type: 'Control',
                  scope: '#/properties/imported_tea',
                },
                {
                  type: 'Group',
                  elements: [
                    {
                      type: 'Control',
                      scope: '#/properties/blend_balances',
                    },
                    {
                      type: 'Control',
                      scope: '#/properties/total_blend_balances_and_gain',
                    },
                  ],
                },
                {
                  type: 'Group',
                  elements: [
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        {
                          type: 'VerticalLayout',
                          elements: [
                            {
                              type: 'Control',
                              scope: '#/properties/remarks',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/sample_rediness_date',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/warehouse_address',
                            },
                          ],
                        },
                        {
                          type: 'VerticalLayout',
                          elements: [
                            {
                              type: 'Control',
                              scope: '#/properties/blend_gain_determined',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/flavors',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/total',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/avg_value_per_kg',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/quantity_to_be_shipped_imported',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/quantity_to_be_shipped_local',
                            },
                            {
                              type: 'Control',
                              scope: '#/properties/blend_balance',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    } as UISchemaElement,
  },
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
          'x-spreadsheet': {
            accept: '.xlsx,.xls,.csv',
            maxSize: 10485760,
            persistSheet: true,
            columnHeader: true,
            rowHeader: false,
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
                // one still works.
                'x-spreadsheet': { columnHeader: true },
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
