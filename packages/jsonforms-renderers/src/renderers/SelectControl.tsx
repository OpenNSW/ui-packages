import { type ControlProps, isEnumControl, type RankedTester, rankWith, isOneOfControl, or } from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react'

import { Select, Text, Flex, Box, TextField, ScrollArea } from '@radix-ui/themes'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { getErrorMessage } from '../utils/error'

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

  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
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

  const isValid = errors.length === 0

  // Derive options
  let options: { value: string; label: string }[] = []

  if (schema.enum) {
    options = schema.enum.map((e) => ({ value: String(e), label: String(e) }))
  } else if (schema.oneOf) {
    options = schema.oneOf.map((o) => ({
      value: String(o.const),
      label: o.title || String(o.const),
    }))
  }

  const value = data !== undefined ? String(data) : ''
  const placeholder = uischema.options?.placeholder || 'Select an option'

  if (isAutocomplete) {
    const selectedLabel = options.find((o) => o.value === value)?.label ?? ''
    const filteredOptions = open
      ? options.filter((o) => o.label.toLowerCase().includes(inputValue.toLowerCase()))
      : options

    const onSelect = (opt: { value: string; label: string }) => {
      handleChange(path, opt.value)
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
            {label} {required && <Text color="red">*</Text>}
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
                if (!open) setOpen(true)
              }}
              onFocus={() => {
                if (enabled && !open) {
                  setInputValue('')
                  setOpen(true)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
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

                    {filteredOptions.map((opt) => (
                      <Box
                        key={opt.value}
                        px="3"
                        py="2"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelect(opt)}
                        style={{
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-2)',
                          backgroundColor: opt.value === value ? 'var(--accent-3)' : undefined,
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

export const SelectControlTester: RankedTester = rankWith(2, or(isEnumControl, isOneOfControl))

export default withJsonFormsControlProps(SelectControl)
