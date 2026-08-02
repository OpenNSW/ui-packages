import { type ControlProps, type JsonSchema } from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { Box, Button, Flex, ScrollArea, Spinner, Text, TextField } from '@radix-ui/themes'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { useSearchService, type SearchOption } from '../contexts/SearchServiceContext'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { getErrorMessage } from '../utils/error'
import * as React from 'react'

interface XSearchOptions {
  service: string
  loadOnOpen?: boolean
}

type SearchSelectProps = ControlProps & {
  schema: JsonSchema & { 'x-search'?: XSearchOptions }
}

const SearchSelectControl = ({
  data,
  handleChange,
  path,
  label,
  required,
  errors,
  enabled,
  visible = true,
  schema,
  uischema,
}: SearchSelectProps) => {
  const xSearch = ((schema as Record<string, unknown>)?.['x-search'] as XSearchOptions) ?? { service: '' }
  const serviceName = xSearch.service ?? ''
  const loadOnOpen = xSearch.loadOnOpen ?? false
  const service = useSearchService(serviceName)

  const isEnabled = enabled !== false
  const isValid = !errors || errors.length === 0

  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [options, setOptions] = useState<SearchOption[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedOption, setSelectedOption] = useState<SearchOption | undefined>(undefined)

  const cursorRef = useRef<unknown>(undefined)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // tracks which value has already been resolved so the effect doesn't re-run when selectedOption changes
  const lastResolvedRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!data) {
      setSelectedOption(undefined)
      lastResolvedRef.current = undefined
      return
    }
    if (lastResolvedRef.current === data) return
    // mark as resolving immediately — prevents re-runs if resolve is absent, rejects, or returns undefined
    lastResolvedRef.current = data as string
    // optimistic raw-value label first, so the field isn't blank while resolving
    setSelectedOption({ id: data as string, name: data as string })
    if (!service?.resolve) return
    let cancelled = false
    void service
      .resolve(data as string)
      .then((opt) => {
        if (!cancelled && opt) setSelectedOption(opt)
      })
      .catch(() => {
        /* keep raw-value fallback */
      })
    return () => {
      cancelled = true
    }
  }, [data, service])

  const runSearch = useCallback(
    async (q: string, isLoadMore = false) => {
      if (!service) {
        setError('Search service not configured.')
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      if (isLoadMore) setLoadingMore(true)
      else {
        setLoading(true)
        setLoadingMore(false)
        setError(null)
      }

      try {
        const result = await service.search({
          query: q,
          cursor: isLoadMore ? cursorRef.current : undefined,
          signal: controller.signal,
        })

        const newItems = result.options ?? []
        if (isLoadMore) setOptions((prev) => [...prev, ...newItems])
        else setOptions(newItems)

        cursorRef.current = result.nextCursor
        setHasMore(result.nextCursor != null)
      } catch (e) {
        if (controller.signal.aborted) return
        setError('Failed to load results. Please try again.')
      } finally {
        // only clear loading if this request wasn't aborted — a new request may already be in flight
        if (!controller.signal.aborted) {
          if (isLoadMore) setLoadingMore(false)
          else setLoading(false)
        }
      }
    },
    [service],
  )

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      setInputValue('')
      setOptions([])
      setHasMore(false)
      setError(null)
      setLoading(false)
      setLoadingMore(false)
      cursorRef.current = undefined
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    if (!inputValue && !loadOnOpen) {
      setOptions([])
      setHasMore(false)
      setError(null)
      cursorRef.current = undefined
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    const delay = inputValue ? 300 : 0
    debounceRef.current = setTimeout(() => {
      setOptions([])
      setHasMore(false)
      cursorRef.current = undefined
      void runSearch(inputValue)
    }, delay)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [inputValue, open, loadOnOpen, runSearch])

  useClearWhenHidden(visible, path, handleChange, null)

  if (visible === false) {
    return null
  }

  const openDropdown = () => {
    setInputValue('')
    setOptions([])
    setHasMore(false)
    setError(null)
    cursorRef.current = undefined
    setOpen(true)
  }

  const onSelect = (option: SearchOption) => {
    handleChange(path, option.id)
    setSelectedOption(option)
    lastResolvedRef.current = option.id // prevent resolve effect from re-running for the just-selected value
    setOpen(false)
  }

  const onClear = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    handleChange(path, null)
    setSelectedOption(undefined)
  }

  const onClearKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') onClear(e)
  }

  const placeholder = (uischema?.options?.placeholder as string | undefined) ?? 'Select an option'

  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold" htmlFor={path}>
          {label} {required && <Text color="red">*</Text>}
        </Text>

        <div ref={containerRef} style={{ position: 'relative' }}>
          <TextField.Root
            id={path}
            value={open ? inputValue : (selectedOption?.name ?? '')}
            placeholder={open ? 'Search...' : placeholder}
            disabled={!isEnabled}
            style={!isValid ? { outline: '2px solid var(--red-7)', outlineOffset: '-1px' } : undefined}
            onChange={(e) => {
              setInputValue(e.target.value)
              if (!open) openDropdown()
            }}
            onFocus={() => {
              if (isEnabled && !open) openDropdown()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
            }}
          >
            <TextField.Slot side="right">
              <Flex align="center" gap="1">
                {data && isEnabled && (
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
              {!service ? (
                <Box p="3">
                  <Text size="2" color="gray">
                    {serviceName ? `Search service "${serviceName}" is not registered.` : 'Search not configured.'}
                  </Text>
                </Box>
              ) : (
                <ScrollArea style={{ maxHeight: 240 }}>
                  <Box p="1">
                    {loading && (
                      <Flex justify="center" p="4">
                        <Spinner />
                      </Flex>
                    )}

                    {!loading && error && (
                      <Box px="3" py="2">
                        <Text size="2" color="red">
                          {error}
                        </Text>
                      </Box>
                    )}

                    {!loading && !error && options.length === 0 && (
                      <Box px="3" py="2">
                        <Text size="2" color="gray">
                          {inputValue || loadOnOpen ? 'No results found.' : 'Type to search…'}
                        </Text>
                      </Box>
                    )}

                    {options.map((opt) => (
                      <Box
                        key={opt.id}
                        px="3"
                        py="2"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelect(opt)}
                        style={{
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-2)',
                          backgroundColor: opt.id === data ? 'var(--accent-3)' : undefined,
                        }}
                        className="hover:bg-(--gray-3)"
                      >
                        <Text size="2">{opt.name}</Text>
                      </Box>
                    ))}

                    {hasMore && !loadingMore && (
                      <Box px="3" py="2">
                        <Button
                          variant="ghost"
                          size="1"
                          style={{ width: '100%' }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void runSearch(inputValue, true)}
                        >
                          Load more
                        </Button>
                      </Box>
                    )}

                    {loadingMore && (
                      <Flex justify="center" p="2">
                        <Spinner />
                      </Flex>
                    )}
                  </Box>
                </ScrollArea>
              )}
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

export default withJsonFormsControlProps(SearchSelectControl)
