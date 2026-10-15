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
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react'

import { Select, Text, Flex, Box, TextField, ScrollArea } from '@radix-ui/themes'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { getErrorMessage } from '../utils/error'

type Option = { value: string; label: string }

function optionSchema(schema: JsonSchema): JsonSchema {
  if (schema.type === 'array') {
    const items = (schema as { items?: JsonSchema | JsonSchema[] }).items
    if (items && !Array.isArray(items)) return items
  }
  return schema
}

function readOptions(schema: JsonSchema): Option[] {
  const target = optionSchema(schema)
  if (target.enum) {
    return target.enum.map((e) => ({ value: String(e), label: String(e) }))
  }
  if (target.oneOf) {
    // Skip blank placeholder consts (hidden/cleared single-selects).
    return target.oneOf
      .filter((o) => o.const !== '' && o.const !== undefined && o.const !== null)
      .map((o) => ({
        value: String(o.const),
        label: o.title || String(o.const),
      }))
  }
  return []
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

  // `options.autocomplete: true` swaps the plain dropdown for a type-to-filter combobox over the
  // same enum/oneOf options — no remote service involved (see SearchSelectControl for that case).
  const isAutocomplete = uischema.options?.autocomplete === true
  const isMulti = schema.type === 'array'

  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if ((!isAutocomplete && !isMulti) || !open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isAutocomplete, isMulti, open])

  const options = useMemo(() => readOptions(schema), [schema])

  const selectedValues: string[] = useMemo(() => {
    if (isMulti) {
      if (!Array.isArray(data)) return []
      return data.map((v) => String(v)).filter((v) => v.length > 0)
    }
    if (data === undefined || data === null || data === '') return []
    return [String(data)]
  }, [data, isMulti])

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const hasSelection = selectedValues.length > 0

  if (visible === false) {
    return null
  }

  const isValid = errors.length === 0
  const value = !isMulti ? (selectedValues[0] ?? '') : ''
  const placeholder = uischema.options?.placeholder || 'Select an option'

  const commitMulti = (next: string[]) => {
    handleChange(path, next.length > 0 ? next : undefined)
  }

  const onToggleMulti = (opt: Option) => {
    const next = selectedSet.has(opt.value)
      ? selectedValues.filter((v) => v !== opt.value)
      : [...selectedValues, opt.value]
    commitMulti(next)
    setInputValue('')
  }

  const onRemoveChip = (e: SyntheticEvent, v: string) => {
    e.stopPropagation()
    commitMulti(selectedValues.filter((x) => x !== v))
  }

  const onClear = (e: SyntheticEvent) => {
    e.stopPropagation()
    handleChange(path, undefined)
    setInputValue('')
  }

  const onClearKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') onClear(e)
  }

  // Multi uses the searchable combobox chrome (chips + toggle) even without autocomplete.
  if (isMulti || isAutocomplete) {
    const selectedLabel = options.find((o) => o.value === value)?.label ?? ''
    const filteredOptions =
      open && (isAutocomplete || isMulti)
        ? options.filter((o) => o.label.toLowerCase().includes(inputValue.toLowerCase()))
        : options
    const activeIndex = Math.min(highlightedIndex, Math.max(filteredOptions.length - 1, 0))

    const onSelectSingle = (opt: Option) => {
      handleChange(path, opt.value)
      setOpen(false)
    }

    const closedDisplay = isMulti ? '' : selectedLabel

    return (
      <Box mb="4">
        <Flex direction="column" gap="1">
          <Text as="label" size="2" weight="bold" htmlFor={path}>
            {label} {required && <Text color="red">*</Text>}
          </Text>

          {isMulti && selectedValues.length > 0 && (
            <Flex gap="1" wrap="wrap" mb="1">
              {selectedValues.map((v) => {
                const chipLabel = options.find((o) => o.value === v)?.label ?? v
                return (
                  <Flex
                    key={v}
                    align="center"
                    gap="1"
                    px="2"
                    py="1"
                    style={{
                      background: 'var(--accent-3)',
                      borderRadius: 'var(--radius-2)',
                      fontSize: 'var(--font-size-1)',
                    }}
                  >
                    <Text size="1">{chipLabel}</Text>
                    {enabled && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Remove ${chipLabel}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => onRemoveChip(e, v)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') onRemoveChip(e, v)
                        }}
                        style={{ lineHeight: 1, color: 'var(--gray-11)', cursor: 'pointer' }}
                      >
                        ×
                      </span>
                    )}
                  </Flex>
                )
              })}
            </Flex>
          )}

          <div ref={containerRef} style={{ position: 'relative' }}>
            <TextField.Root
              id={path}
              value={open ? inputValue : closedDisplay}
              placeholder={open ? 'Search...' : placeholder}
              disabled={!enabled}
              readOnly={isMulti && !open}
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
                    if (isMulti) onToggleMulti(filteredOptions[activeIndex])
                    else onSelectSingle(filteredOptions[activeIndex])
                  }
                }
              }}
            >
              <TextField.Slot side="right">
                <Flex align="center" gap="1">
                  {hasSelection && enabled && (
                    <span
                      role="button"
                      tabIndex={0}
                      onMouseDown={(e) => e.preventDefault()}
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

                    {filteredOptions.map((opt, index) => {
                      const selected = selectedSet.has(opt.value)
                      return (
                        <Box
                          key={opt.value}
                          px="3"
                          py="2"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => (isMulti ? onToggleMulti(opt) : onSelectSingle(opt))}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          style={{
                            cursor: 'pointer',
                            borderRadius: 'var(--radius-2)',
                            backgroundColor:
                              index === activeIndex
                                ? 'var(--accent-4)'
                                : selected
                                  ? 'var(--accent-3)'
                                  : undefined,
                          }}
                        >
                          <Flex align="center" justify="between" gap="2">
                            <Text size="2">{opt.label}</Text>
                            {isMulti && selected && (
                              <Text size="1" color="gray">
                                ✓
                              </Text>
                            )}
                          </Flex>
                        </Box>
                      )
                    })}
                  </Box>
                </ScrollArea>
              </Box>
            )}
          </div>

          {!isValid && (
            <Text color="red" size="1">
              {getErrorMessage(errors, label)}
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
          {label} {required && <Text color="red">*</Text>}
        </Text>
        <Select.Root value={value} onValueChange={(val) => handleChange(path, val)} disabled={!enabled}>
          <Select.Trigger placeholder={placeholder} color={!isValid ? 'red' : undefined} id={path} />
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
            {getErrorMessage(errors, label)}
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

/** Array of enum/oneOf strings — rank above PrimitiveArrayControl (3). */
const isMultiEnumSelect = schemaMatches((schema: JsonSchema) => {
  if (schema.type !== 'array') return false
  const items = (schema as { items?: JsonSchema | JsonSchema[] }).items
  if (!items || Array.isArray(items)) return false
  return Boolean(items.enum || items.oneOf)
})

// Keep single-select at rank 2 so RadioControl (rank 3 for format:radio) still wins.
export const SelectControlTester: RankedTester = rankWith(2, or(isEnumControl, isOneOfControl))

export const MultiSelectControlTester: RankedTester = rankWith(4, isMultiEnumSelect)

export default withJsonFormsControlProps(SelectControl)
