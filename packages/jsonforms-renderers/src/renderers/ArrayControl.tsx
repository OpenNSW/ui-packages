import {
  createDefaultValue,
  getControlPath,
  getI18nKeyPrefix,
  type ArrayControlProps,
  type JsonSchema,
  type UISchemaElement,
} from '@jsonforms/core'
import { withJsonFormsArrayControlProps, JsonFormsDispatch, useJsonForms } from '@jsonforms/react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { stampRowTemplates } from '../utils/sequence'
import type { SequenceCounters } from '../utils/sequence'
import { spellNumber } from '../utils/numberWords'
import { getErrorMessage } from '../utils/error'
import { useIsRequired } from '../hooks/useIsRequired'
import { type ListMessage, type MessageValues, listText } from '../utils/messages'
import { type ListTotal, listTotals, summarizeRow } from '../utils/listSummary'
import { ConfirmRemoveDialog } from './ConfirmRemoveDialog'
import { Card, Button, Dialog, Flex, IconButton, Separator, Text, Box } from '@radix-ui/themes'
import { ChevronRightIcon, Cross2Icon, FileTextIcon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'

interface ListOptions {
  addable?: boolean
  removable?: boolean
  itemLabel?: string
  /** "word" spells the row number in English (Attachment One). Defaults to a digit. */
  itemNumber?: 'number' | 'word'
  addLabel?: string
  emptyLabel?: string
  errorMessage?: string
  detail?: UISchemaElement
  /** "cards": each item is a one-line card that opens in a dialog. */
  display?: 'cards'
  /** A card's first line, e.g. "{dc_grade} · {number_of_bags} bags". */
  summary?: string
  /** A card's second line, in the same form. */
  summaryDetail?: string
  /** Running totals above the list. */
  totals?: ListTotal[]
}

interface AddItemButtonProps {
  path: string
  items: unknown[]
  itemsSchema: JsonSchema
  rootSchema: JsonSchema
  addItem: ArrayControlProps['addItem']
  sequences: RefObject<SequenceCounters>
  label: string
  buttonRef: RefObject<HTMLButtonElement | null>
  onAdded: (index: number) => void
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
    onAdded(items.length)
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

/** The fields of one row: the uischema's `detail`, or every property of the row. */
function rowUiSchema(uischema: UISchemaElement, itemsSchema: JsonSchema): UISchemaElement {
  const detail = (uischema.options as ListOptions | undefined)?.detail
  if (detail) return detail
  if (itemsSchema.type === 'object' || itemsSchema.properties) {
    return {
      type: 'VerticalLayout',
      elements: Object.keys(itemsSchema.properties || {}).map((key) => ({
        type: 'Control',
        scope: `#/properties/${key}`,
      })),
    }
  }
  return { type: 'Control', scope: '#' }
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
  label,
  i18nKeyPrefix,
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
  // For the wording's translation and locale, and to mark rows with errors.
  const ctx = useJsonForms()
  const translate = ctx.i18n?.translate
  const locale = ctx.i18n?.locale
  // The HOC passes the prefix JSON Forms computed for this control. A direct
  // render does not, so derive the same one: the control's `i18n`, else the
  // schema's, else the data path.
  const i18nPrefix = i18nKeyPrefix ?? getI18nKeyPrefix(arraySchema ?? schema, uischema, path)
  const t = (key: ListMessage, values?: MessageValues) => listText(translate, key, values, i18nPrefix)

  // The row waiting for the remove confirmation, the row open in the dialog
  // (cards only; isNew while it is a row just added), and what the last
  // removal left for screen readers.
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null)
  const [open, setOpen] = useState<{ index: number; isNew: boolean } | null>(null)
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

  const items = Array.isArray(data) ? (data as unknown[]) : []
  const schemaTitle = actualArraySchema.title || 'Array Items'
  const options = (uischema.options ?? {}) as ListOptions
  const cards = options.display === 'cards'
  const canAdd = enabled && options.addable !== false
  const canRemove = enabled && options.removable !== false
  const itemLabel = options.itemLabel || 'Item'
  const addLabel = options.addLabel || t('addItem')
  const emptyLabel = options.emptyLabel || t('empty')
  // JSON Forms turns `label: false` into '' and then still translates
  // `<prefix>.label`, so a translation can put the heading back. Read the
  // uischema for the hide. A string label replaces the schema title. A direct
  // render that omits the prop still shows the schema title. The required
  // mark is part of the heading. The error names the heading, or the schema
  // title when the heading is hidden, so "Attachments is required" still reads.
  const heading = uischema.label === false ? '' : label !== undefined ? label : schemaTitle
  const fieldName = heading || schemaTitle
  // minItems >= 1 is separate from schema `required`: an empty array fails
  // with a minItems error, not a required error, so useIsRequired alone
  // would miss it.
  const showRequired =
    conditionallyRequired || (typeof actualArraySchema.minItems === 'number' && actualArraySchema.minItems >= 1)
  const isValid = !errors
  // options.errorMessage is for the empty-array case (required / minItems).
  // Other array errors (e.g. maxItems) keep AJV's message.
  const displayError = !isValid
    ? (items.length === 0 && options.errorMessage) || getErrorMessage(errors, fieldName)
    : ''

  const summaryOf = (row: unknown) =>
    options.summary ? summarizeRow(options.summary, row, validItemsSchema, locale) : ''
  const nameOf = (index: number) => `${itemLabel} ${options.itemNumber === 'word' ? spellNumber(index + 1) : index + 1}`
  // "Item 2 (MEDIUM · 240 bags)": the row's name, with its summary when it has one.
  const fullNameOf = (index: number) => {
    const summary = summaryOf(items[index])
    return summary ? `${nameOf(index)} (${summary})` : nameOf(index)
  }
  // "2 items · 740 bags · 18,500 kg total", for the rows given.
  const totalsOf = (rows: unknown[]) =>
    [
      t(rows.length === 1 ? 'countOne' : 'countOther', { count: rows.length }),
      ...listTotals(rows, options.totals ?? [], locale),
    ].join(' · ')
  const showTotals = items.length > 0 && (cards || (options.totals?.length ?? 0) > 0)

  // Rows with errors, marked on their cards once the form shows errors at all.
  const showErrors = ctx.core?.validationMode !== 'ValidateAndHide' && ctx.core?.validationMode !== 'NoValidation'
  const rowsWithErrors = new Set<number>()
  if (cards && showErrors) {
    const prefix = `${path}.`
    for (const error of [...(ctx.core?.errors ?? []), ...(ctx.core?.additionalErrors ?? [])]) {
      const errorPath = getControlPath(error) as string
      if (errorPath.startsWith(prefix)) rowsWithErrors.add(Number(errorPath.slice(prefix.length).split('.')[0]))
    }
  }

  const removeRow = (index: number) => {
    if (!removeItems) return
    const removeFunc = removeItems(path, [index])
    if (removeFunc) removeFunc()
  }

  const confirmRemove = () => {
    if (confirmIndex === null) return
    const index = confirmIndex
    const name = fullNameOf(index)
    const remaining = items.filter((_, i) => i !== index)
    removeRow(index)
    setStatus(
      remaining.length && showTotals
        ? t('removedTotals', { item: name, totals: totalsOf(remaining) })
        : t('removed', { item: name }),
    )
    focusAfterRemove.current = index
    setConfirmIndex(null)
  }

  const onAdded = (index: number) => {
    setStatus('')
    if (cards) setOpen({ index, isNew: true })
  }

  const fields = (index: number, rowEnabled: boolean) => (
    <JsonFormsDispatch
      schema={validItemsSchema}
      uischema={rowUiSchema(uischema, validItemsSchema)}
      path={`${path}.${index}`}
      enabled={rowEnabled}
      renderers={undefined} /* use inherited renderers */
      cells={undefined} /* use inherited cells */
    />
  )

  return (
    <Box mb="6" id={path} tabIndex={-1} style={{ outline: 'none' }}>
      <Flex direction="column" gap="4">
        {heading && (
          <Text as="div" size="4" weight="bold">
            {heading} {showRequired && <Text color="red">*</Text>}
          </Text>
        )}

        {showTotals && (
          <Text as="p" size="2" weight="medium">
            {totalsOf(items)}
          </Text>
        )}

        <Text as="p" size="2" role="status" style={status ? undefined : { display: 'none' }}>
          {status}
        </Text>

        {items.length === 0 && (
          <Box py="4" px="4" style={{ backgroundColor: 'var(--gray-3)', borderRadius: 'var(--radius-3)' }}>
            <Text size="2" color="gray">
              {emptyLabel}
            </Text>
          </Box>
        )}

        {!isValid && (
          <Text color="red" size="1">
            {displayError}
          </Text>
        )}

        {items.map((row, index) => {
          const key = `${path}.${index}`
          if (cards) {
            const summary = summaryOf(row)
            const detail = options.summaryDetail
              ? summarizeRow(options.summaryDetail, row, validItemsSchema, locale)
              : ''
            const hasError = rowsWithErrors.has(index)
            return (
              <Card
                key={key}
                size="1"
                variant="surface"
                style={hasError ? { boxShadow: 'inset 0 0 0 1px var(--red-8)' } : undefined}
              >
                <Flex align="center" gap="3">
                  <button
                    ref={(el) => {
                      rowRefs.current[index] = el
                    }}
                    type="button"
                    onClick={() => setOpen({ index, isNew: false })}
                    aria-label={t('openItem', { item: fullNameOf(index) })}
                    className="enabled:hover:bg-[var(--gray-a2)]"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 8,
                      border: 0,
                      borderRadius: 'var(--radius-3)',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Box
                      aria-hidden
                      style={{
                        background: 'var(--accent-3)',
                        color: 'var(--accent-11)',
                        padding: 8,
                        borderRadius: 'var(--radius-2)',
                        flexShrink: 0,
                        display: 'flex',
                      }}
                    >
                      <FileTextIcon width="18" height="18" />
                    </Box>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text as="p" size="2" weight="bold">
                        {summary || nameOf(index)}
                      </Text>
                      {detail && (
                        <Text as="p" size="1" color="gray">
                          {detail}
                        </Text>
                      )}
                      {hasError && (
                        <Text as="p" size="1" color="red">
                          {t('needsAttention')}
                        </Text>
                      )}
                    </Box>
                    <ChevronRightIcon aria-hidden />
                  </button>
                  {canRemove && (
                    <>
                      <Separator orientation="vertical" size="2" />
                      <IconButton
                        type="button"
                        variant="ghost"
                        color="gray"
                        onClick={() => setConfirmIndex(index)}
                        aria-label={t('removeItem', { item: fullNameOf(index) })}
                      >
                        <Cross2Icon />
                      </IconButton>
                    </>
                  )}
                </Flex>
              </Card>
            )
          }
          return (
            <Card
              key={key}
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
                      aria-label={t('removeItem', { item: fullNameOf(index) })}
                    >
                      <TrashIcon />
                      {t('remove')}
                    </Button>
                  )}
                </Flex>
                <Box>{fields(index, enabled)}</Box>
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
            label={addLabel}
            buttonRef={addRef}
            onAdded={onAdded}
          />
        )}
      </Flex>

      {cards && open && open.index < items.length && (
        <Dialog.Root open onOpenChange={(isOpen) => !isOpen && setOpen(null)}>
          <Dialog.Content maxWidth="640px">
            <Dialog.Title>{nameOf(open.index)}</Dialog.Title>
            <Dialog.Description size="2" color="gray" mb="4">
              {summaryOf(items[open.index])}
            </Dialog.Description>
            {fields(open.index, enabled)}
            <Flex gap="3" mt="4" justify="between">
              {!open.isNew && canRemove ? (
                <Button
                  type="button"
                  color="red"
                  variant="soft"
                  onClick={() => {
                    const index = open.index
                    setOpen(null)
                    setConfirmIndex(index)
                  }}
                >
                  <TrashIcon />
                  {t('remove')}
                </Button>
              ) : (
                <span />
              )}
              <Flex gap="3">
                {open.isNew && (
                  <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    onClick={() => {
                      // Cancelling a row just added discards it: nothing was there to keep.
                      removeRow(open.index)
                      setOpen(null)
                      addRef.current?.focus()
                    }}
                  >
                    {t('cancel')}
                  </Button>
                )}
                <Dialog.Close>
                  <Button type="button">{open.isNew ? t('add') : enabled ? t('done') : t('close')}</Button>
                </Dialog.Close>
              </Flex>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      )}

      <ConfirmRemoveDialog
        open={confirmIndex !== null}
        onOpenChange={(isOpen) => !isOpen && setConfirmIndex(null)}
        title={confirmIndex === null ? '' : t('confirmTitle', { item: fullNameOf(confirmIndex) })}
        description={t('confirmDescription')}
        keepLabel={t('keepItem')}
        removeLabel={t('removeConfirmed')}
        onConfirm={confirmRemove}
      />
    </Box>
  )
}

export default withJsonFormsArrayControlProps(ArrayControl)
