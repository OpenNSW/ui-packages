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
    id: 'search-select',
    name: 'Search Select',
    schema: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description: 'Type to search — cursor-paginated, 5 per page',
          'x-search': { service: 'countries' },
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
    id: 'excel-source-file',
    name: 'Excel source file',
    schema: {
      type: 'object',
      properties: {
        sales_file: {
          type: 'string',
          format: 'file',
          title: 'Upload Sales Sheet',
          description: 'Pick an .xlsx or .xlsm and the rows below fill in from it.',
          // FileControl filters the picker and validates against this list, so
          // an extension missing here never reaches the parse at all.
          'x-file': { accept: '.xlsx,.xlsm' },
          'x-excel': {
            target: 'sales',
            columns: {
              date_of_sale: { match: ['date of sale', 'sale date'], type: 'date', required: true },
              garden_mark: { match: ['garden mark', 'garden'], type: 'string' },
              grade: { match: ['grade'], type: 'string' },
              rate_per_kg: { match: ['rate per kg', 'rate'], type: 'number' },
              quantity_kg: { match: ['qty in kg', 'quantity in kg', 'qty'], type: 'number', required: true },
              total_value: { match: ['total value rs', 'total value', 'total'], type: 'number' },
            },
            derive: {
              total_quantity_kg: 'SUM(quantity_kg)',
              avg_rate_per_kg: 'ROUND(SUM(total_value) / SUM(quantity_kg), 2)',
              dominant_grade: 'INDEX(grade, MATCH(MAX(quantity_kg), quantity_kg, 0))',
              all_grades: 'TEXTJOIN(", ", TRUE, grade)',
              consignment_size: 'IF(SUM(quantity_kg) > 30000, "BULK", "SMALL")',
            },
          },
        },
        sales: {
          type: 'array',
          title: 'Particulars of Sale',
          readOnly: true,
          items: {
            type: 'object',
            properties: {
              date_of_sale: { type: 'string', format: 'date', title: 'Date of Sale' },
              garden_mark: { type: 'string', title: 'Garden Mark' },
              grade: { type: 'string', title: 'Grade' },
              rate_per_kg: { type: 'number', title: 'Rate per KG' },
              quantity_kg: { type: 'number', title: 'QTY in KG' },
              total_value: { type: 'number', title: 'Total Value (Rs)' },
            },
          },
        },
        total_quantity_kg: { type: 'number', title: 'Total Quantity (KG)', readOnly: true },
        avg_rate_per_kg: { type: 'number', title: 'Avg Rate per KG', readOnly: true },
        dominant_grade: { type: 'string', title: 'Grade / Standard', readOnly: true },
        all_grades: { type: 'string', title: 'All Grades', readOnly: true },
        consignment_size: { type: 'string', title: 'Consignment Size', readOnly: true },
      },
      required: ['sales_file'],
    } as JsonSchema,
    uischema: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/sales_file' },
        {
          // Displayed by the ordinary ArrayControl. `readOnly` on the schema
          // suppresses its Add/Remove controls; the HorizontalLayout detail
          // lays each row out across the page instead of as a stack.
          type: 'Control',
          scope: '#/properties/sales',
          options: {
            // Grouped into short rows rather than one wide HorizontalLayout:
            // that renderer gives every element an equal `flex: 1` share, so
            // ten columns on one line squeezes each to a fraction of the width
            // and long values get clipped.
            detail: {
              type: 'VerticalLayout',
              elements: [
                {
                  type: 'HorizontalLayout',
                  elements: [
                    { type: 'Control', scope: '#/properties/date_of_sale' },
                    { type: 'Control', scope: '#/properties/garden_mark' },
                    { type: 'Control', scope: '#/properties/grade' },
                  ],
                },
                {
                  type: 'HorizontalLayout',
                  elements: [
                    { type: 'Control', scope: '#/properties/rate_per_kg' },
                    { type: 'Control', scope: '#/properties/quantity_kg' },
                    { type: 'Control', scope: '#/properties/total_value' },
                  ],
                },
              ],
            },
          },
        },
        {
          type: 'HorizontalLayout',
          elements: [
            { type: 'Control', scope: '#/properties/total_quantity_kg' },
            { type: 'Control', scope: '#/properties/avg_rate_per_kg' },
            { type: 'Control', scope: '#/properties/dominant_grade' },
            { type: 'Control', scope: '#/properties/consignment_size' },
            { type: 'Control', scope: '#/properties/all_grades' },
          ],
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
