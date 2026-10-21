import { createDefaultValue, type ArrayControlProps, type JsonSchema } from '@jsonforms/core'
import { withJsonFormsArrayControlProps, JsonFormsDispatch, useJsonForms } from '@jsonforms/react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { stampRowTemplates } from '../utils/sequence'
import type { SequenceCounters } from '../utils/sequence'
import { getErrorMessage } from '../utils/error'
import { useIsRequired } from '../hooks/useIsRequired'
import { type ListMessage, type MessageValues, listText } from '../utils/messages'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog'
import { Card, Button, Flex, Text, Box } from '@radix-ui/themes'
import { PlusIcon, TrashIcon } from '@radix-ui/react-icons'

interface AddItemButtonProps {
  path: string
  items: unknown[]
  itemsSchema: JsonSchema
  rootSchema: JsonSchema
  addItem: ArrayControlProps['addItem']
  sequences: RefObject<SequenceCounters>
  label: string
  buttonRef: RefObject<HTMLButtonElement | null>
  onAdded: () => void
}

const AddItemButton = ({
  path,
  items,
  itemsSchema,
  rootSchema,
  addItem,
  sequences,
  label,
  buttonRef,
  onAdded,
}: AddItemButtonProps) => {
  // The whole form, for the placeholders a template resolves against — the
  // array control is only ever handed its own slice.
  const ctx = useJsonForms()

  const handleAddItem = () => {
    const newItem = stampRowTemplates(
      itemsSchema,
      createDefaultValue(itemsSchema, rootSchema),
      items,
      ctx.core?.data,
      // The object CONTAINING the array, not the row: a row being filled is
      // empty, so what a template reaches for sits alongside the array.
      path.split('.').slice(0, -1).join('.'),
      sequences.current,
    )
    if (addItem) addItem(path, newItem)()
    onAdded()
  }

  return (
    <Box mt="2">
      <Button ref={buttonRef} type="button" variant="surface" onClick={handleAddItem}>
        <PlusIcon />
        {label}
      </Button>
    </Box>
  )
}

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
  required = false,
  errors = '',
}: ArrayControlProps) => {
  // Numbers already handed out to this array's numbered `x-template` fields.
  // A ref, not state: it must survive a row being removed, or the next row
  // added would be given the removed row's number. Held here rather than by
  // each row's own control because the count belongs to the array, not the
  // row. It does NOT survive this control unmounting — see SequenceCounters
  // in utils/sequence.ts for what that costs and what covers it.
  const sequences = useRef<SequenceCounters>({})
  // Above the early returns: hooks must run unconditionally. Also covers
  // arrays that become required through allOf/if/then (#112).
  const conditionallyRequired = useIsRequired(path, required, visible)
  // For the wording's translation.
  const translate = useJsonForms().i18n?.translate
  const t = (key: ListMessage, values?: MessageValues) => listText(translate, key, values)

  // The row waiting for the remove confirmation, and what the last removal
  // left for screen readers.
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  // After a removal, focus moves to the row now at that position (or the one
  // before it, or Add Item), once the row is gone.
  const focusAfterRemove = useRef<number | null>(null)
  const rowRefs = useRef<(HTMLElement | null)[]>([])
  const addRef = useRef<HTMLButtonElement>(null)
  const length = Array.isArray(data) ? data.length : 0
  useEffect(() => {
    if (focusAfterRemove.current === null) return
    const target = rowRefs.current[Math.min(focusAfterRemove.current, length - 1)] ?? addRef.current
    focusAfterRemove.current = null
    target?.focus()
  }, [length])

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
  const options = (uischema.options ?? {}) as {
    addable?: boolean
    removable?: boolean
    itemLabel?: string
    errorMessage?: string
  }
  const canAdd = enabled && options.addable !== false
  const canRemove = enabled && options.removable !== false
  const itemLabel = options.itemLabel || 'Item'
  // minItems >= 1 is separate from schema `required`: an empty array fails
  // with a minItems error, not a required error, so useIsRequired alone
  // would miss it.
  const showRequired =
    conditionallyRequired || (typeof actualArraySchema.minItems === 'number' && actualArraySchema.minItems >= 1)
  const isValid = !errors
  // options.errorMessage is for the empty-array case (required / minItems).
  // Other array errors (e.g. maxItems) keep AJV's message.
  const displayError = !isValid ? (items.length === 0 && options.errorMessage) || getErrorMessage(errors, title) : ''
  const nameOf = (index: number) => `${itemLabel} ${index + 1}`

  const confirmRemove = () => {
    if (confirmIndex === null) return
    if (removeItems) {
      const removeFunc = removeItems(path, [confirmIndex])
      if (removeFunc) removeFunc()
    }
    setStatus(t('removed', { item: nameOf(confirmIndex) }))
    focusAfterRemove.current = confirmIndex
    setConfirmIndex(null)
  }

  return (
    <Box mb="6" id={path} tabIndex={-1} style={{ outline: 'none' }}>
      <Flex direction="column" gap="4">
        <Text as="div" size="4" weight="bold">
          {title} {showRequired && <Text color="red">*</Text>}
        </Text>

        <Text as="p" size="2" role="status" style={status ? undefined : { display: 'none' }}>
          {status}
        </Text>

        {items.length === 0 && (
          <Box py="4" px="4" style={{ backgroundColor: 'var(--gray-3)', borderRadius: 'var(--radius-3)' }}>
            <Text size="2" color="gray">
              {t('empty')}
            </Text>
          </Box>
        )}

        {!isValid && (
          <Text color="red" size="1">
            {displayError}
          </Text>
        )}

        {items.map((_item, index) => {
          const childPath = `${path}.${index}`
          return (
            <Card
              key={childPath}
              size="3"
              variant="surface"
              ref={(el) => {
                rowRefs.current[index] = el
              }}
              tabIndex={-1}
              style={{ outline: 'none' }}
            >
              <Flex direction="column" gap="4">
                <Flex justify="between" align="center">
                  <Text size="3" weight="bold">
                    {nameOf(index)}
                  </Text>
                  {canRemove && (
                    <Button
                      type="button"
                      color="red"
                      variant="soft"
                      onClick={() => setConfirmIndex(index)}
                      aria-label={t('removeItem', { item: nameOf(index) })}
                    >
                      <TrashIcon />
                      {t('remove')}
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
          <AddItemButton
            path={path}
            items={items}
            itemsSchema={validItemsSchema}
            rootSchema={rootSchema}
            addItem={addItem}
            sequences={sequences}
            label={t('addItem')}
            buttonRef={addRef}
            onAdded={() => setStatus('')}
          />
        )}
      </Flex>

      <ConfirmRemoveDialog
        open={confirmIndex !== null}
        onOpenChange={(isOpen) => !isOpen && setConfirmIndex(null)}
        title={confirmIndex === null ? '' : t('confirmTitle', { item: nameOf(confirmIndex) })}
        description={t('confirmDescription')}
        keepLabel={t('keepItem')}
        removeLabel={t('removeConfirmed')}
        onConfirm={confirmRemove}
      />
    </Box>
  )
}

export default withJsonFormsArrayControlProps(ArrayControl)
