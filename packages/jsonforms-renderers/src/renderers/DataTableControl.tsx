import { useMemo } from 'react'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { Box, Flex, Table, Text } from '@radix-ui/themes'

// A dense, read-only grid for arrays of objects — for rows that arrive from a
// source such as an uploaded spreadsheet rather than being typed in one at a
// time. Opt in from the uiSchema:
//
//   { "type": "Control", "scope": "#/properties/sales",
//     "options": { "table": true, "totals": ["quantity_kg", "total_value"] } }
//
// Columns come from the item schema's properties, in declaration order, using
// each property's `title` as the header. `totals` names the numeric columns to
// sum in a footer row.

type ColumnDef = {
  field: string
  title: string
  numeric: boolean
}

function columnsOf(schema: JsonSchema | undefined): ColumnDef[] {
  const items = schema?.items as JsonSchema | undefined
  // JsonSchema is a union of draft 4 and 7 shapes, so `properties` widens to
  // `any`; narrow it once here rather than at each field access.
  const properties = items?.properties as Record<string, JsonSchema> | undefined
  if (!properties) return []
  return Object.entries(properties).map(([field, property]) => {
    const type = property.type
    return {
      field,
      title: property.title ?? field,
      numeric: type === 'number' || type === 'integer',
    }
  })
}

function formatCell(value: unknown, numeric: boolean): string {
  if (value === undefined || value === null || value === '') return '—'
  if (numeric && typeof value === 'number') {
    return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return '—'
}

export const DataTableControlView = ({ data, schema, label, uischema, visible = true }: ControlProps) => {
  const columns = useMemo(() => columnsOf(schema), [schema])
  const rows = useMemo(() => (Array.isArray(data) ? (data as Record<string, unknown>[]) : []), [data])
  const totalFields = useMemo(() => (uischema?.options?.totals as string[] | undefined) ?? [], [uischema])

  const totals = useMemo(() => {
    const result: Record<string, number> = {}
    for (const field of totalFields) {
      result[field] = rows.reduce((sum, row) => {
        const value = row[field]
        return sum + (typeof value === 'number' ? value : 0)
      }, 0)
    }
    return result
  }, [rows, totalFields])

  if (!visible) return null
  if (columns.length === 0) return null

  return (
    <Box mb="4">
      <Flex direction="column" gap="2">
        {label && (
          <Text as="label" size="2" weight="bold">
            {label}
          </Text>
        )}
        {rows.length === 0 ? (
          <Box
            p="5"
            style={{
              border: '1px dashed var(--gray-6)',
              borderRadius: 'var(--radius-3)',
              textAlign: 'center',
            }}
          >
            <Text size="2" color="gray">
              No rows yet.
            </Text>
          </Box>
        ) : (
          // A wide grid scrolls inside its own container rather than pushing
          // the whole form sideways.
          <Box style={{ overflowX: 'auto', border: '1px solid var(--gray-5)', borderRadius: 'var(--radius-3)' }}>
            <Table.Root size="1" variant="ghost">
              <Table.Header>
                <Table.Row>
                  {columns.map((column) => (
                    <Table.ColumnHeaderCell key={column.field} align={column.numeric ? 'right' : 'left'}>
                      {column.title}
                    </Table.ColumnHeaderCell>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row, index) => (
                  <Table.Row key={index}>
                    {columns.map((column) => (
                      <Table.Cell key={column.field} align={column.numeric ? 'right' : 'left'}>
                        {formatCell(row[column.field], column.numeric)}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
                {totalFields.length > 0 && (
                  <Table.Row>
                    {columns.map((column, index) => (
                      <Table.Cell key={column.field} align={column.numeric ? 'right' : 'left'}>
                        <Text weight="bold">
                          {index === 0
                            ? 'Total'
                            : totals[column.field] !== undefined
                              ? formatCell(totals[column.field], true)
                              : ''}
                        </Text>
                      </Table.Cell>
                    ))}
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
      </Flex>
    </Box>
  )
}

// Bound to a name before export: an anonymous default export leaves Fast
// Refresh unable to identify the component across reloads.
const DataTableControl = withJsonFormsControlProps(DataTableControlView)

export default DataTableControl
