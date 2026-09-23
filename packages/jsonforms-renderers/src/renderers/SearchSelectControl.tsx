import { type ControlProps, type JsonSchema, Resolve } from '@jsonforms/core'
import { useJsonForms, withJsonFormsControlProps } from '@jsonforms/react'
import { Box, Button, Flex, ScrollArea, Spinner, Text, TextField } from '@radix-ui/themes'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react'
import { useSearchService, type SearchOption } from '../contexts/SearchServiceContext'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { getErrorMessage } from '../utils/error'
import * as React from 'react'

export type SearchSelectMode = 'small-list' | 'large-searchable-list' | 'large-paginated-list'

interface XSearchOptions {
  service: string
  mode?: SearchSelectMode
  // fixed extra arguments forwarded to the service's search/resolve calls — lets one registered service back
  // several fields hitting the same endpoint with different filters (e.g. category: 'books' vs category: 'movies')
  params?: Record<string, unknown>
  // sibling property name (sent as params.parent), or param-key → sibling property for several live filters
  dependsOn?: string | Record<string, string>
  // `{id}` / `{name}` string used as the dropdown / selected label. Required —
  // a missing or empty value shows a config error instead of falling back to `name`.
  displayTemplate: string
}

function dependsOnConst(raw: unknown): string | undefined {
  if (typeof raw === 'string' && raw.length > 0) return raw
  if (raw && typeof raw === 'object' && typeof (raw as { value?: unknown }).value === 'string') {
    const v = (raw as { value: string }).value
    return v.length > 0 ? v : undefined
  }
  return undefined
}

// string form is the original one-sibling API: dependsOn: "commodity" → { parent: "commodity" }.
// An empty object means the map was declared but had no usable entries — still "configured",
// so the control gates forever instead of treating dependsOn as absent and fetching immediately.
function dependsOnSpec(raw: XSearchOptions['dependsOn']): Record<string, string> | undefined {
  if (typeof raw === 'string') return raw.length > 0 ? { parent: raw } : undefined
  if (!raw || typeof raw !== 'object') return undefined

  const entries = Object.entries(raw)
  if (entries.length === 0) return undefined

  const spec: Record<string, string> = {}
  const dropped: string[] = []
  for (const [key, sibling] of entries) {
    if (typeof sibling === 'string' && sibling.length > 0) spec[key] = sibling
    else dropped.push(key)
  }
  if (dropped.length > 0) {
    console.warn(`x-search.dependsOn: ignoring invalid entries [${dropped.join(', ')}]`)
  }
  if (Object.keys(spec).length === 0) {
    console.warn('x-search.dependsOn: map has no valid entries; search will not fetch until fixed')
    return {}
  }
  return spec
}

// Same Resolve.data / parentPath convention as resolveComputedInputs, but keeps per-key
// unset values (compute short-circuits the whole map) and unwraps search-select { value, label }.
function resolveDependsOnValues(
  spec: Record<string, string>,
  data: unknown,
  parentPath: string,
): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {}
  for (const [paramKey, siblingProp] of Object.entries(spec)) {
    values[paramKey] = dependsOnConst(Resolve.data(data, parentPath ? `${parentPath}.${siblingProp}` : siblingProp))
  }
  return values
}

// shape of `data` for an object-typed `x-search` field (`type: "object"`); string-typed fields keep `data` as the raw id
interface SearchSelectValue {
  value: string
  label?: string
}

type SearchSelectProps = ControlProps & {
  schema: JsonSchema & { 'x-search'?: XSearchOptions }
}

// `{id}` / `{name}` → that field as a string; unknown tokens become '' so a
// typo does not leave the placeholder in the dropdown.
function applyDisplayTemplate(template: string, option: SearchOption): string {
  const fields: Record<string, string> = { id: option.id, name: option.name }
  return template.replace(/\{(\w+)\}/g, (_, key: string) => fields[key] ?? '')
}

function presentOption(option: SearchOption, displayTemplate: string): SearchOption {
  // configError already blocks the dropdown; skip interpolation so resolve
  // cannot blank a selected label when the schema forgot the key.
  if (!displayTemplate) return option
  return { ...option, name: applyDisplayTemplate(displayTemplate, option) }
}

// The only three valid combinations of {fetch on open, typed search, "load more" pagination}.
const MODE_CONFIG: Record<SearchSelectMode, { fetchOnOpen: boolean; searchable: boolean; paginated: boolean }> = {
  'small-list': { fetchOnOpen: true, searchable: false, paginated: false },
  'large-searchable-list': { fetchOnOpen: true, searchable: true, paginated: false },
  'large-paginated-list': { fetchOnOpen: false, searchable: true, paginated: true },
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
  const xSearch = ((schema as Record<string, unknown>)?.['x-search'] as XSearchOptions) ?? {
    service: '',
    displayTemplate: '',
  }
  const serviceName = xSearch.service ?? ''
  // unconfigured mode defaults to the "search before fetching" lifecycle — the safest choice for an unknown data size
  const mode = xSearch.mode ?? 'large-paginated-list'
  const modeConfig = MODE_CONFIG[mode]
  const fetchOnOpen = modeConfig?.fetchOnOpen ?? false
  const displayTemplate = typeof xSearch.displayTemplate === 'string' ? xSearch.displayTemplate : ''
  const ctx = useJsonForms()
  const parentPath = path.split('.').slice(0, -1).join('.')
  // Memoized the same way ComputedControl caches resolveComputedInputs: form-wide data
  // changes re-render this control even when its own siblings haven't moved.
  const { parentValues, parentValuesKey, missingParent } = useMemo(() => {
    const spec = dependsOnSpec(xSearch.dependsOn)
    if (!spec) return { parentValues: undefined, parentValuesKey: '', missingParent: false }
    const parentValues = resolveDependsOnValues(spec, ctx.core?.data, parentPath)
    // Empty spec (invalid map) → never ready. Otherwise wait until every sibling is set.
    const missingParent = Object.keys(parentValues).length === 0 || Object.values(parentValues).some((v) => !v)
    return { parentValues, parentValuesKey: JSON.stringify(parentValues), missingParent }
  }, [xSearch.dependsOn, ctx.core?.data, parentPath])
  const searchParams = useMemo(() => {
    if (!parentValues) return xSearch.params
    return { ...xSearch.params, ...parentValues }
  }, [parentValues, parentValuesKey, xSearch.params])
  const service = useSearchService(serviceName)

  const isObjectMode = schema.type === 'object'
  // legacy records may have a bare string in `data` if the field was migrated from `type: "string"` after being saved
  const normalizedData: SearchSelectValue | undefined = isObjectMode
    ? typeof data === 'string'
      ? { value: data }
      : ((data as SearchSelectValue | undefined) ?? undefined)
    : undefined
  const currentValue = isObjectMode ? normalizedData?.value : (data as string | undefined)
  const currentLabel = normalizedData?.label

  const configError = !serviceName
    ? 'Search not configured.'
    : !service
      ? `Search service "${serviceName}" is not registered.`
      : !modeConfig
        ? `Invalid x-search.mode "${mode}". Expected "small-list", "large-searchable-list", or "large-paginated-list".`
        : !displayTemplate
          ? 'x-search.displayTemplate is required.'
          : null

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
  // tracks which value+label has already been resolved so the effect doesn't re-run when selectedOption changes
  const lastResolvedRef = useRef<{ value: string; label?: string } | undefined>(undefined)
  const lastParentRef = useRef<Record<string, string | undefined> | undefined>(undefined)

  useEffect(() => {
    if (!parentValues) return
    const prev = lastParentRef.current
    lastParentRef.current = parentValues
    if (!prev || !currentValue) return
    // same rule as the original single-sibling check: only a previously-set value
    // changing (including to unset) clears; going from unset → set does not
    const changed = Object.keys(parentValues).some((k) => prev[k] !== undefined && prev[k] !== parentValues[k])
    if (changed) handleChange(path, isObjectMode ? undefined : null)
  }, [parentValuesKey, currentValue, handleChange, path, isObjectMode])

  useEffect(() => {
    if (!currentValue) {
      setSelectedOption(undefined)
      lastResolvedRef.current = undefined
      return
    }
    if (lastResolvedRef.current?.value === currentValue && lastResolvedRef.current?.label === currentLabel) return
    // mark as resolving immediately — prevents re-runs if resolve is absent, rejects, or returns undefined
    lastResolvedRef.current = { value: currentValue, label: currentLabel }

    // object-shaped fields already carry the label from submission time — no need to re-resolve it
    if (isObjectMode && currentLabel) {
      setSelectedOption({ id: currentValue, name: currentLabel })
      return
    }

    // optimistic raw-value label first, so the field isn't blank while resolving
    setSelectedOption({ id: currentValue, name: currentLabel ?? currentValue })
    if (!service?.resolve) return
    let cancelled = false
    void service
      .resolve(currentValue, searchParams)
      .then((opt) => {
        if (!cancelled && opt) setSelectedOption(presentOption(opt, displayTemplate))
      })
      .catch(() => {
        /* keep raw-value fallback */
      })
    return () => {
      cancelled = true
    }
  }, [currentValue, currentLabel, isObjectMode, service, searchParams, displayTemplate])

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
          params: searchParams,
        })

        // Services are asked to throw on abort, but a slower one may still resolve. Don't
        // let that stale payload overwrite a newer search (typed query or a new sibling).
        if (controller.signal.aborted) return

        const newItems = (result.options ?? []).map((opt) => presentOption(opt, displayTemplate))
        if (isLoadMore) setOptions((prev) => [...prev, ...newItems])
        else setOptions(newItems)

        cursorRef.current = result.nextCursor
        setHasMore((modeConfig?.paginated ?? false) && result.nextCursor != null)
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
    [service, modeConfig?.paginated, searchParams, displayTemplate],
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

    if (missingParent) {
      setOptions([])
      setHasMore(false)
      setError(null)
      cursorRef.current = undefined
      return
    }

    if (!inputValue && !fetchOnOpen) {
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
  }, [inputValue, open, fetchOnOpen, runSearch, missingParent, parentValuesKey])

  // `undefined` in both modes — the scalar branch used to clear with `null`,
  // but the underlying schema is `type: 'string'` there, which null doesn't
  // satisfy, so a hidden-then-shown field would be stuck on "must be string".
  // undefined restores the pristine "nothing selected" state in either mode.
  useClearWhenHidden(visible, path, handleChange)

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
    handleChange(path, isObjectMode ? { value: option.id, label: option.name } : option.id)
    setSelectedOption(option)
    // prevent resolve effect from re-running for the just-selected value
    lastResolvedRef.current = { value: option.id, label: isObjectMode ? option.name : undefined }
    setOpen(false)
  }

  const onClear = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    // `undefined` in both modes, same reason as the clear-when-hidden call
    // above: `null` doesn't satisfy the scalar branch's `type: 'string'`, so
    // clearing a selection would leave the field failing validation.
    handleChange(path, undefined)
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
            placeholder={open && modeConfig?.searchable ? 'Search...' : placeholder}
            disabled={!isEnabled}
            readOnly={open && !modeConfig?.searchable}
            style={!isValid ? { outline: '2px solid var(--red-7)', outlineOffset: '-1px' } : undefined}
            onChange={(e) => {
              if (!modeConfig?.searchable) return
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
                {currentValue && isEnabled && (
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
              {configError ? (
                <Box p="3">
                  <Text size="2" color="gray">
                    {configError}
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
                          {missingParent
                            ? 'Select the related field first.'
                            : inputValue || fetchOnOpen
                              ? 'No results found.'
                              : 'Type to search…'}
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
                          backgroundColor: opt.id === currentValue ? 'var(--accent-3)' : undefined,
                        }}
                        className="hover:bg-(--gray-3)"
                      >
                        <Text size="2">{opt.name}</Text>
                      </Box>
                    ))}

                    {modeConfig?.paginated && hasMore && !loadingMore && (
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
