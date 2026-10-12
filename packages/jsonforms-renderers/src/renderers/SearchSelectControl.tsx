import { type ControlProps, type JsonSchema, Resolve } from '@jsonforms/core'
import { useJsonForms, withJsonFormsControlProps } from '@jsonforms/react'
import { Box, Button, Flex, ScrollArea, Spinner, Text, TextField } from '@radix-ui/themes'
import { ChevronDownIcon, LockClosedIcon } from '@radix-ui/react-icons'
import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react'
import { useSearchService, type SearchOption } from '../contexts/SearchServiceContext'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { useIsRequired } from '../hooks/useIsRequired'
import { getErrorMessage } from '../utils/error'
import { useAnswerPlaceholder, useReadOnlyMark } from '../contexts/formReview'
import { renderTemplate } from '../utils/template'
import { searchSelectTargetSchema } from './SearchSelectControlTester'
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
  // Sibling property this field mirrors. Copies while empty, and whenever the sibling
  // changes (overwriting a prior value — including a user edit). The field stays editable.
  // Same Resolve path as dependsOn: relative to this control's parent object.
  defaultFrom?: string
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

function isSearchSelectEmpty(data: unknown, isObjectMode: boolean): boolean {
  if (data == null || data === '') return true
  if (isObjectMode) {
    if (typeof data === 'string') return data.length === 0
    if (typeof data === 'object') {
      const value = (data as SearchSelectValue).value
      return typeof value !== 'string' || value.length === 0
    }
  }
  return false
}

// Shape this field's stored value from a sibling's current data. Object-mode fields keep
// { value, label }; string-mode fields store the id only.
function valueFromDefaultSibling(sibling: unknown, isObjectMode: boolean): unknown {
  if (sibling == null || sibling === '') return undefined
  if (typeof sibling === 'string') {
    return sibling.length > 0 ? (isObjectMode ? { value: sibling } : sibling) : undefined
  }
  if (typeof sibling === 'object') {
    const value = (sibling as SearchSelectValue).value
    if (typeof value !== 'string' || value.length === 0) return undefined
    if (isObjectMode) {
      const label = (sibling as SearchSelectValue).label
      return typeof label === 'string' && label.length > 0 ? { value, label } : { value }
    }
    return value
  }
  return undefined
}

function searchSelectValuesEqual(a: unknown, b: unknown, isObjectMode: boolean): boolean {
  if (isSearchSelectEmpty(a, isObjectMode) && (b === undefined || isSearchSelectEmpty(b, isObjectMode))) {
    return true
  }
  if (isObjectMode) {
    const av = typeof a === 'object' && a !== null ? (a as SearchSelectValue) : undefined
    const bv = typeof b === 'object' && b !== null ? (b as SearchSelectValue) : undefined
    return av?.value === bv?.value && (av?.label ?? undefined) === (bv?.label ?? undefined)
  }
  return a === b
}

// shape of `data` for an object-typed `x-search` field (`type: "object"`); string-typed fields keep `data` as the raw id
interface SearchSelectValue {
  value: string
  label?: string
}

function asSearchSelectValue(raw: unknown): SearchSelectValue | undefined {
  if (typeof raw === 'string' && raw.length > 0) return { value: raw }
  if (raw && typeof raw === 'object' && typeof (raw as SearchSelectValue).value === 'string') {
    const v = raw as SearchSelectValue
    return { value: v.value, label: v.label }
  }
  return undefined
}

type SearchSelectProps = ControlProps & {
  schema: JsonSchema & { 'x-search'?: XSearchOptions }
}

function presentOption(option: SearchOption, displayTemplate: string): SearchOption {
  // configError already blocks the dropdown; skip interpolation so resolve
  // cannot blank a selected label when the schema forgot the key.
  if (!displayTemplate) return option
  return { ...option, name: renderTemplate(displayTemplate, option) }
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
  const isMulti = schema.type === 'array'
  const itemSchema = (searchSelectTargetSchema(schema) ?? schema) as JsonSchema & { 'x-search'?: XSearchOptions }
  const xSearch = (itemSchema['x-search'] as XSearchOptions | undefined) ?? {
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

  const isObjectMode = itemSchema.type === 'object'
  const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : undefined
  const selectedValues: SearchSelectValue[] = useMemo(() => {
    if (isMulti) {
      if (!Array.isArray(data)) return []
      return data.map(asSearchSelectValue).filter((v): v is SearchSelectValue => !!v)
    }
    const one = asSearchSelectValue(isObjectMode ? data : typeof data === 'string' ? data : undefined)
    return one ? [one] : []
  }, [data, isMulti, isObjectMode])

  // Single-select helpers (unchanged behaviour for string/object fields).
  const currentValue = !isMulti ? selectedValues[0]?.value : undefined
  const currentLabel = !isMulti ? selectedValues[0]?.label : undefined
  const selectedIds = useMemo(() => new Set(selectedValues.map((v) => v.value)), [selectedValues])
  const hasSelection = selectedValues.length > 0
  // Multi string arrays only store ids; keep labels from onSelect / resolve for chips.
  const multiLabelCacheRef = useRef<Record<string, string>>({})
  const [multiLabelVersion, setMultiLabelVersion] = useState(0)
  const chipLabels = useMemo(() => {
    const labels: Record<string, string> = {}
    for (const v of selectedValues) {
      labels[v.value] = v.label || multiLabelCacheRef.current[v.value] || v.value
    }
    return labels
  }, [selectedValues, multiLabelVersion])
  const atMaxItems = isMulti && maxItems !== undefined && selectedValues.length >= maxItems

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

  const commitSelection = useCallback(
    (next: SearchSelectValue[]) => {
      if (isMulti) {
        handleChange(path, next.length > 0 ? next.map((v) => (isObjectMode ? v : v.value)) : undefined)
        return
      }
      const one = next[0]
      if (!one) {
        handleChange(path, undefined)
        return
      }
      handleChange(path, isObjectMode ? { value: one.value, label: one.label } : one.value)
    },
    [handleChange, path, isMulti, isObjectMode],
  )

  useEffect(() => {
    if (!parentValues) return
    const prev = lastParentRef.current
    lastParentRef.current = parentValues
    if (!prev || !hasSelection) return
    // same rule as the original single-sibling check: only a previously-set value
    // changing (including to unset) clears; going from unset → set does not
    const changed = Object.keys(parentValues).some((k) => prev[k] !== undefined && prev[k] !== parentValues[k])
    if (changed) handleChange(path, undefined)
  }, [parentValuesKey, hasSelection, handleChange, path])

  const defaultFrom =
    typeof xSearch.defaultFrom === 'string' && xSearch.defaultFrom.length > 0 ? xSearch.defaultFrom : undefined
  const formReadonly = ctx.readonly === true
  const defaultFromSibling = useMemo(() => {
    if (!defaultFrom) return undefined
    return Resolve.data(ctx.core?.data, parentPath ? `${parentPath}.${defaultFrom}` : defaultFrom)
  }, [defaultFrom, ctx.core?.data, parentPath])
  const defaultFromSiblingKey = useMemo(() => JSON.stringify(defaultFromSibling ?? null), [defaultFromSibling])
  // Tracks the last sibling snapshot we reacted to so a sibling change always syncs,
  // while a user edit of this field alone does not.
  const lastDefaultFromSiblingKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!defaultFrom || !visible || !isEnabled || formReadonly) return
    const next = valueFromDefaultSibling(defaultFromSibling, isObjectMode)
    const prevKey = lastDefaultFromSiblingKey.current
    const siblingChanged = prevKey !== undefined && prevKey !== defaultFromSiblingKey

    let write: { value: unknown } | undefined
    if (siblingChanged) {
      // Importing country (etc.) changed: mirror it, including clearing this field.
      // Cleared value matches dependsOn: undefined for object mode, null for string mode.
      if (!searchSelectValuesEqual(data, next ?? undefined, isObjectMode)) {
        write = { value: next === undefined ? (isObjectMode ? undefined : null) : next }
      }
    } else if (isSearchSelectEmpty(data, isObjectMode) && next !== undefined) {
      // Sibling unchanged: only fill while empty (initial fill, or after a clear).
      write = { value: next }
    }

    if (!write) {
      lastDefaultFromSiblingKey.current = defaultFromSiblingKey
      return
    }

    // Defer one tick: on mount, JsonFormsStateProvider's updateCore effect runs after this
    // child effect and resets core.data to the `data` prop, dropping a synchronous write.
    // The sibling key is recorded only once the write lands, so if this is cancelled by a
    // re-render the next run still sees the sibling change.
    const pending = write
    const timer = setTimeout(() => {
      lastDefaultFromSiblingKey.current = defaultFromSiblingKey
      handleChange(path, pending.value)
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFrom, defaultFromSiblingKey, data, isObjectMode, visible, isEnabled, formReadonly])

  useEffect(() => {
    if (isMulti) {
      // String arrays store only ids; object items already carry labels. Resolve
      // any id that still lacks a chip label (preload / remount).
      if (configError || isObjectMode) return
      const missing = selectedValues.filter((v) => !v.label && !multiLabelCacheRef.current[v.value])
      if (missing.length === 0) return
      if (!service?.resolve) return

      let cancelled = false
      void Promise.all(
        missing.map(async (v) => {
          try {
            const opt = await service.resolve!(v.value, searchParams)
            if (cancelled || !opt) return
            multiLabelCacheRef.current[v.value] = presentOption(opt, displayTemplate).name
          } catch {
            // keep the raw id on the chip
          }
        }),
      ).then(() => {
        if (!cancelled) setMultiLabelVersion((n) => n + 1)
      })
      return () => {
        cancelled = true
      }
    }

    if (configError) {
      setSelectedOption(undefined)
      lastResolvedRef.current = undefined
      return
    }
    if (!currentValue) {
      setSelectedOption(undefined)
      lastResolvedRef.current = undefined
      return
    }
    if (lastResolvedRef.current?.value === currentValue && lastResolvedRef.current?.label === currentLabel) return

    // object-shaped fields already carry the label from submission time — no need to re-resolve it
    if (isObjectMode && currentLabel) {
      setSelectedOption({ id: currentValue, name: currentLabel })
      lastResolvedRef.current = { value: currentValue, label: currentLabel }
      return
    }

    // optimistic raw-value label first, so the field isn't blank while resolving
    setSelectedOption({ id: currentValue, name: currentLabel ?? currentValue })
    if (!service?.resolve) {
      lastResolvedRef.current = { value: currentValue, label: currentLabel }
      return
    }

    // Mark resolved only after this call settles. StrictMode runs the effect,
    // cancels it, and runs it again; recording the id up front makes that
    // second run skip resolve and leave the raw id on screen.
    let cancelled = false
    const value = currentValue
    const label = currentLabel
    void service
      .resolve(value, searchParams)
      .then((opt) => {
        if (cancelled) return
        if (opt) setSelectedOption(presentOption(opt, displayTemplate))
        lastResolvedRef.current = { value, label }
      })
      .catch(() => {
        if (!cancelled) lastResolvedRef.current = { value, label }
      })
    return () => {
      cancelled = true
    }
  }, [
    configError,
    currentValue,
    currentLabel,
    isObjectMode,
    isMulti,
    selectedValues,
    service,
    searchParams,
    displayTemplate,
  ])

  const runSearch = useCallback(
    async (q: string, isLoadMore = false) => {
      if (configError) return
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
    [configError, service, modeConfig?.paginated, searchParams, displayTemplate],
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
  const showRequired = useIsRequired(path, required, visible)
  const locked = useReadOnlyMark(enabled)
  const placeholderProps = useAnswerPlaceholder(
    (uischema?.options?.placeholder as string | undefined) ?? 'Select an option',
  )

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
    if (isMulti) {
      const exists = selectedIds.has(option.id)
      if (!exists && atMaxItems) return
      const next = exists
        ? selectedValues.filter((v) => v.value !== option.id)
        : [...selectedValues, { value: option.id, label: option.name }]
      if (!exists) {
        multiLabelCacheRef.current[option.id] = option.name
        setMultiLabelVersion((n) => n + 1)
      }
      commitSelection(next)
      // keep the dropdown open so more countries can be added
      setInputValue('')
      return
    }
    commitSelection([{ value: option.id, label: option.name }])
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

  const onRemoveChip = (e: React.SyntheticEvent, value: string) => {
    e.stopPropagation()
    commitSelection(selectedValues.filter((v) => v.value !== value))
  }

  const onClearKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') onClear(e)
  }

  // Multi: chips above the field are the selection UI; keep the closed input empty.
  const closedDisplay = isMulti ? '' : (selectedOption?.name ?? '')

  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold" htmlFor={path}>
          {label} {showRequired && <Text color="red">*</Text>}
        </Text>

        {isMulti && selectedValues.length > 0 && (
          <Flex gap="1" wrap="wrap" mb="1">
            {selectedValues.map((v) => (
              <Flex
                key={v.value}
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
                <Text size="1">{chipLabels[v.value] ?? v.value}</Text>
                {isEnabled && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${chipLabels[v.value] ?? v.value}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => onRemoveChip(e, v.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onRemoveChip(e, v.value)
                    }}
                    style={{ lineHeight: 1, color: 'var(--gray-11)', cursor: 'pointer' }}
                  >
                    ×
                  </span>
                )}
              </Flex>
            ))}
          </Flex>
        )}

        <div ref={containerRef} style={{ position: 'relative' }}>
          <TextField.Root
            id={path}
            value={open ? inputValue : closedDisplay}
            placeholder={open && modeConfig?.searchable ? 'Search...' : placeholderProps.placeholder}
            data-empty-answer={placeholderProps['data-empty-answer']}
            disabled={!isEnabled}
            readOnly={(open && !modeConfig?.searchable) || (isMulti && !open)}
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
                {hasSelection && isEnabled && (
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
                {locked ? (
                  <LockClosedIcon aria-hidden data-testid="read-only-lock" style={{ color: 'var(--gray-10)' }} />
                ) : (
                  <ChevronDownIcon
                    style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }}
                  />
                )}
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

                    {options.map((opt) => {
                      const selected = selectedIds.has(opt.id)
                      const capped = atMaxItems && !selected
                      return (
                        <Box
                          key={opt.id}
                          px="3"
                          py="2"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            if (!capped) onSelect(opt)
                          }}
                          aria-disabled={capped || undefined}
                          style={{
                            cursor: capped ? 'not-allowed' : 'pointer',
                            opacity: capped ? 0.5 : 1,
                            borderRadius: 'var(--radius-2)',
                            backgroundColor: selected ? 'var(--accent-3)' : undefined,
                          }}
                          className={capped ? undefined : 'hover:bg-(--gray-3)'}
                        >
                          <Flex align="center" justify="between" gap="2">
                            <Text size="2">{opt.name}</Text>
                            {isMulti && selected && (
                              <Text size="1" color="gray">
                                ✓
                              </Text>
                            )}
                          </Flex>
                        </Box>
                      )
                    })}

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
