import {
  type ControlProps,
  isEnumControl,
  type JsonSchema,
  type RankedTester,
  rankWith,
  isOneOfControl,
  or,
  schemaMatches,
} from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { useDefaultFrom } from '../hooks/useDefaultFrom'
import { useIsRequired } from '../hooks/useIsRequired'
import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react'

import { Select, Text, Flex, Box, TextField, ScrollArea } from '@radix-ui/themes'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { getErrorMessage } from '../utils/error'

interface SelectOption {
  value: string
  label: string
  raw: unknown
}

// shape of `data` for an object-typed field (`type: "object"`); string-typed fields keep `data` as the raw value
interface SelectValue {
  value: string | number | boolean
  label?: string
}

export const SelectControl = ({
  data,
  handleChange,
  path,
  label,
  required,
  errors,
  schema,
  uischema,
  enabled,
  visible = true,
}: ControlProps) => {
  useClearWhenHidden(visible, path, handleChange)
  useDefaultFrom(data, path, schema, enabled, visible, handleChange)
  const showRequired = useIsRequired(path, required, visible)

  // `options.autocomplete: true` swaps the plain dropdown for a type-to-filter combobox over the
  // same enum/oneOf options — no remote service involved (see SearchSelectControl for that case).
  const isAutocomplete = uischema.options?.autocomplete === true

  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAutocomplete || !open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isAutocomplete, open])

  if (visible === false) {
    return null
  }

  // `type: "object"` fields keep their enum/oneOf under `properties.value` and store
  // `{ value, label }`, like an object-shaped SearchSelectControl; string fields store the raw value.
  const isObjectMode = schema.type === 'object'
  const optionsSchema = isObjectMode ? (schema.properties?.value ?? {}) : schema

  // Derive options. `raw` is the schema's own const, written as-is in object mode so a
  // non-string `value` schema still validates; string mode keeps storing String(raw).
  let options: SelectOption[] = []

  if (optionsSchema.enum) {
    options = optionsSchema.enum.map((e: unknown) => ({ value: String(e), label: String(e), raw: e }))
  } else if (optionsSchema.oneOf) {
    options = optionsSchema.oneOf.map((o) => {
      const raw: unknown = o.const
      return { value: String(raw), label: o.title || String(raw), raw }
    })
  }

  // legacy records may have a bare value in `data` if the field was migrated from `type: "string"` after being saved
  const normalizedData: SelectValue | undefined = isObjectMode
    ? typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean'
      ? { value: data }
      : ((data as SelectValue | undefined) ?? undefined)
    : undefined
  const currentValue = isObjectMode ? normalizedData?.value : (data as SelectValue['value'] | undefined)
  const currentLabel = normalizedData?.label
  const value = currentValue !== undefined && currentValue !== null ? String(currentValue) : ''
  // object-shaped fields already carry the label from submission time; otherwise the option's title
  const selectedLabel = currentLabel ?? options.find((o) => o.value === value)?.label ?? ''
  const placeholder = uischema.options?.placeholder || 'Select an option'

  // In object mode the options validate `value`, below this control's path, so a stored value that
  // is no longer an option fails the form without its error reaching `errors`. Say so here instead.
  const unavailable = isObjectMode && value !== '' && !options.some((o) => o.value === value)
  const errorMessage = errors
    ? getErrorMessage(errors, label)
    : unavailable
      ? `"${selectedLabel || value}" is no longer an available option`
      : ''
  const isValid = errorMessage === ''

  const commit = (opt: SelectOption) => {
    handleChange(path, isObjectMode ? { value: opt.raw, label: opt.label } : opt.value)
  }

  if (isAutocomplete) {
    const filteredOptions = open
      ? options.filter((o) => o.label.toLowerCase().includes(inputValue.toLowerCase()))
      : options
    // clamp rather than store out-of-range: the filtered list shrinks as the user keeps typing
    const activeIndex = Math.min(highlightedIndex, filteredOptions.length - 1)

    const onSelect = (opt: SelectOption) => {
      commit(opt)
      setOpen(false)
    }

    const onClear = (e: SyntheticEvent) => {
      e.stopPropagation()
      handleChange(path, undefined)
      setInputValue('')
    }

    const onClearKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') onClear(e)
    }

    return (
      <Box mb="4">
        <Flex direction="column" gap="1">
          <Text as="label" size="2" weight="bold" htmlFor={path}>
            {label} {showRequired && <Text color="red">*</Text>}
          </Text>

          <div ref={containerRef} style={{ position: 'relative' }}>
            <TextField.Root
              id={path}
              value={open ? inputValue : selectedLabel}
              placeholder={placeholder}
              disabled={!enabled}
              style={!isValid ? { outline: '2px solid var(--red-7)', outlineOffset: '-1px' } : undefined}
              onChange={(e) => {
                setInputValue(e.target.value)
                setHighlightedIndex(0)
                if (!open) setOpen(true)
              }}
              onFocus={() => {
                if (enabled && !open) {
                  setInputValue('')
                  setHighlightedIndex(0)
                  setOpen(true)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  if (!open) {
                    setInputValue('')
                    setOpen(true)
                  } else {
                    setHighlightedIndex((i) => Math.min(i + 1, filteredOptions.length - 1))
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  if (open) setHighlightedIndex((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter') {
                  if (open && filteredOptions[activeIndex]) {
                    e.preventDefault()
                    onSelect(filteredOptions[activeIndex])
                  }
                }
              }}
            >
              <TextField.Slot side="right">
                <Flex align="center" gap="1">
                  {value && enabled && (
                    <span
                      role="button"
                      tabIndex={0}
                      onMouseDown={(e) => e.preventDefault()} // prevent input blur before click fires
                      onClick={onClear}
                      onKeyDown={onClearKeyDown}
                      style={{ lineHeight: 1, color: 'var(--gray-9)', padding: '0 2px', cursor: 'pointer' }}
                      aria-label="Clear selection"
                    >
                      ×
                    </span>
                  )}
                  <ChevronDownIcon
                    style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}
                  />
                </Flex>
              </TextField.Slot>
            </TextField.Root>

            {open && (
              <Box
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: 'var(--color-panel-solid)',
                  borderRadius: 'var(--radius-3)',
                  boxShadow: 'var(--shadow-5)',
                  border: '1px solid var(--gray-a6)',
                  overflow: 'hidden',
                }}
              >
                <ScrollArea style={{ maxHeight: 240 }}>
                  <Box p="1">
                    {filteredOptions.length === 0 && (
                      <Box px="3" py="2">
                        <Text size="2" color="gray">
                          No results found.
                        </Text>
                      </Box>
                    )}

                    {filteredOptions.map((opt, index) => (
                      <Box
                        key={opt.value}
                        px="3"
                        py="2"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelect(opt)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        style={{
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-2)',
                          backgroundColor:
                            index === activeIndex
                              ? 'var(--accent-4)'
                              : opt.value === value
                                ? 'var(--accent-3)'
                                : undefined,
                        }}
                      >
                        <Text size="2">{opt.label}</Text>
                      </Box>
                    ))}
                  </Box>
                </ScrollArea>
              </Box>
            )}
          </div>

          {!isValid && (
            <Text color="red" size="1">
              {errorMessage}
            </Text>
          )}
          {schema.description && (
            <Text size="1" color="gray">
              {schema.description}
            </Text>
          )}
        </Flex>
      </Box>
    )
  }

  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold" htmlFor={path}>
          {label} {showRequired && <Text color="red">*</Text>}
        </Text>
        <Select.Root
          value={value}
          onValueChange={(val) => {
            const selected = options.find((o) => o.value === val)
            if (selected) commit(selected)
          }}
          disabled={!enabled}
        >
          <Select.Trigger placeholder={placeholder} color={!isValid ? 'red' : undefined} id={path}>
            {/* shows the stored label even when its value is no longer one of the options */}
            {isObjectMode && currentLabel ? currentLabel : undefined}
          </Select.Trigger>
          <Select.Content>
            {options.map((opt) => (
              <Select.Item key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        {!isValid && (
          <Text color="red" size="1">
            {errorMessage}
          </Text>
        )}
        {schema.description && (
          <Text size="1" color="gray">
            {schema.description}
          </Text>
        )}
      </Flex>
    </Box>
  )
}

export const SelectControlTester: RankedTester = rankWith(2, or(isEnumControl, isOneOfControl))

// An object field whose `value` property carries the enum/oneOf. Rank 3 like SearchSelectControlTester,
// which it never ties with: an `x-search` field is left to that control.
export const SelectObjectControlTester: RankedTester = rankWith(
  3,
  schemaMatches((schema: JsonSchema) => {
    if (schema.type !== 'object' || (schema as Record<string, unknown>)['x-search'] !== undefined) return false
    const valueSchema = schema.properties?.value
    return Array.isArray(valueSchema?.enum) || Array.isArray(valueSchema?.oneOf)
  }),
)

export default withJsonFormsControlProps(SelectControl)
