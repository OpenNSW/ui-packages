import { createDefaultValue, type ArrayControlProps } from '@jsonforms/core'
import { withJsonFormsArrayControlProps, JsonFormsDispatch, useJsonForms } from '@jsonforms/react'
import { useRef } from 'react'
import { stampRowTemplates } from '../utils/sequence'
import type { SequenceCounters } from '../utils/sequence'
import { Card, Button, Flex, Text, Box } from '@radix-ui/themes'
import { PlusIcon, TrashIcon } from '@radix-ui/react-icons'

export const ArrayControl = ({
  data,
  path,
  schema,
  uischema,
  enabled,
  visible,
  addItem,
  removeItems,
  rootSchema,
  arraySchema,
}: ArrayControlProps) => {
  // Numbers already handed out to this array's numbered `x-template` fields.
  // A ref, not state: it must survive a row being removed, or the next row
  // added would be given the removed row's number. Held here rather than by
  // each row's own control because the count belongs to the array, not the
  // row. It does NOT survive this control unmounting — see SequenceCounters
  // in utils/sequence.ts for what that costs and what covers it.
  const sequences = useRef<SequenceCounters>({})
  // The whole form, for the placeholders a template resolves against — this
  // control is only ever handed its own slice.
  const ctx = useJsonForms()

  // If `arraySchema` is present, `schema` is already our `itemsSchema`, else fall back to `schema.items`
  const itemsSchema = arraySchema ? schema : schema.items
  const actualArraySchema = arraySchema || schema

  if (visible === false) {
    return null
  }
  if (!itemsSchema || typeof itemsSchema !== 'object' || Array.isArray(itemsSchema)) {
    return null
  }

  // After the guard, we know itemsSchema is a valid single JsonSchema object
  const validItemsSchema = itemsSchema

  const items = Array.isArray(data) ? data : []
  const title = actualArraySchema.title || 'Array Items'
  const options = (uischema.options ?? {}) as { addable?: boolean; removable?: boolean; itemLabel?: string }
  const canAdd = enabled && options.addable !== false
  const canRemove = enabled && options.removable !== false
  const itemLabel = options.itemLabel || 'Item'

  const handleAddItem = () => {
    const newItem = stampRowTemplates(
      validItemsSchema,
      createDefaultValue(validItemsSchema, rootSchema),
      items,
      ctx.core?.data,
      // The object CONTAINING the array, not the row: a row being numbered is
      // empty, so what a template reaches for sits alongside the array.
      path.split('.').slice(0, -1).join('.'),
      sequences.current,
    )
    if (addItem) addItem(path, newItem)()
  }

  const handleRemoveItem = (indexToRemove: number) => {
    if (removeItems) {
      const removeFunc = removeItems(path, [indexToRemove])
      if (removeFunc) removeFunc()
    }
  }

  return (
    <Box mb="6">
      <Flex direction="column" gap="4">
        <Text as="div" size="4" weight="bold">
          {title}
        </Text>

        {items.length === 0 && (
          <Box py="4" px="4" style={{ backgroundColor: 'var(--gray-3)', borderRadius: 'var(--radius-3)' }}>
            <Text size="2" color="gray">
              No items have been added yet.
            </Text>
          </Box>
        )}

        {items.map((_item, index) => {
          const childPath = `${path}.${index}`
          return (
            <Card key={childPath} size="3" variant="surface">
              <Flex direction="column" gap="4">
                <Flex justify="between" align="center">
                  <Text size="3" weight="bold">
                    {itemLabel} {index + 1}
                  </Text>
                  {canRemove && (
                    <Button
                      type="button"
                      color="red"
                      variant="soft"
                      onClick={() => handleRemoveItem(index)}
                      title="Remove item"
                    >
                      <TrashIcon />
                      Remove
                    </Button>
                  )}
                </Flex>

                <Box>
                  <JsonFormsDispatch
                    schema={validItemsSchema}
                    uischema={
                      uischema.options?.detail ||
                      (validItemsSchema.type === 'object' || validItemsSchema.properties
                        ? {
                            type: 'VerticalLayout',
                            elements: Object.keys(validItemsSchema.properties || {}).map((key) => ({
                              type: 'Control',
                              scope: `#/properties/${key}`,
                            })),
                          }
                        : {
                            type: 'Control',
                            scope: '#',
                          })
                    }
                    path={childPath}
                    enabled={enabled}
                    renderers={undefined} /* use inherited renderers */
                    cells={undefined} /* use inherited cells */
                  />
                </Box>
              </Flex>
            </Card>
          )
        })}

        {canAdd && (
          <Box mt="2">
            <Button type="button" variant="surface" onClick={handleAddItem}>
              <PlusIcon />
              Add Item
            </Button>
          </Box>
        )}
      </Flex>
    </Box>
  )
}

export default withJsonFormsArrayControlProps(ArrayControl)
