import { useEffect, useMemo, useRef } from 'react'
import { type JsonSchema, Resolve } from '@jsonforms/core'
import { useJsonForms } from '@jsonforms/react'

function fieldType(schema: JsonSchema | undefined): string | undefined {
  const type = schema?.type
  if (Array.isArray(type)) return type.find((entry) => entry !== 'null')
  return type
}

function defaultFromSource(schema: JsonSchema | undefined): string | undefined {
  const raw = (schema as { 'x-defaultFrom'?: unknown } | undefined)?.['x-defaultFrom']
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

function isEmpty(data: unknown, schema: JsonSchema | undefined): boolean {
  if (data == null || data === '') return true
  const type = fieldType(schema)
  if (type === 'array' && Array.isArray(data)) return data.length === 0
  if (type === 'object' && typeof data === 'object' && !Array.isArray(data) && 'value' in data) {
    const value = (data as { value?: unknown }).value
    return value == null || value === ''
  }
  return false
}

// What this field should store for the sibling's current data. Search-select and
// select objects keep { value, label }; a string field stores the id. Other
// types copy the sibling as it is (a number, a boolean, a date, an array).
function valueFromSibling(sibling: unknown, schema: JsonSchema | undefined): unknown {
  if (sibling == null || sibling === '') return undefined
  const type = fieldType(schema)
  if (type === 'array') return Array.isArray(sibling) ? sibling : undefined
  if (typeof sibling === 'number' || typeof sibling === 'boolean') return sibling
  if (typeof sibling === 'string') {
    return sibling.length > 0 ? (type === 'object' ? { value: sibling } : sibling) : undefined
  }
  if (typeof sibling === 'object') {
    if (Array.isArray(sibling)) return type === 'array' ? sibling : undefined
    const record = sibling as { value?: unknown; label?: unknown }
    if (type === 'string' || type === 'number' || type === 'integer' || type === 'boolean') {
      return record.value == null || record.value === '' ? undefined : record.value
    }
    if (type === 'object' && 'value' in record) {
      if (record.value == null || record.value === '') return undefined
      return typeof record.label === 'string' && record.label.length > 0
        ? { value: record.value, label: record.label }
        : { value: record.value }
    }
    return sibling
  }
  return undefined
}

function valuesEqual(current: unknown, next: unknown, schema: JsonSchema | undefined): boolean {
  if (isEmpty(current, schema) && (next === undefined || isEmpty(next, schema))) return true
  const type = fieldType(schema)
  if (
    type === 'object' &&
    current &&
    next &&
    typeof current === 'object' &&
    typeof next === 'object' &&
    'value' in current &&
    'value' in next
  ) {
    const left = current as { value?: unknown; label?: unknown }
    const right = next as { value?: unknown; label?: unknown }
    return left.value === right.value && (left.label ?? undefined) === (right.label ?? undefined)
  }
  return Object.is(current, next)
}

/**
 * Mirror a sibling field named by `x-defaultFrom`.
 *
 * Copies while this field is empty, and again whenever the sibling changes
 * (including over a value the user set). Between those changes the control
 * stays editable. Skips a readonly form, a disabled field, and a hidden field.
 * The path is relative to this control's parent, same as `x-computed` inputs.
 */
export function useDefaultFrom(
  data: unknown,
  path: string,
  schema: JsonSchema | undefined,
  enabled: boolean | undefined,
  visible: boolean | undefined,
  handleChange: (path: string, value: unknown) => void,
): void {
  const ctx = useJsonForms()
  const source = defaultFromSource(schema)
  const formReadonly = ctx.readonly === true
  const parentPath = path.split('.').slice(0, -1).join('.')
  const sibling = useMemo(() => {
    if (!source) return undefined
    return Resolve.data(ctx.core?.data, parentPath ? `${parentPath}.${source}` : source)
  }, [source, ctx.core?.data, parentPath])
  const siblingKey = useMemo(() => JSON.stringify(sibling ?? null), [sibling])
  // Last sibling snapshot we reacted to, so a sibling change always syncs and
  // a user edit of this field alone does not.
  const lastSiblingKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!source || visible === false || enabled === false || formReadonly) return
    const next = valueFromSibling(sibling, schema)
    const prevKey = lastSiblingKey.current
    const siblingChanged = prevKey !== undefined && prevKey !== siblingKey

    let write: { value: unknown } | undefined
    if (siblingChanged) {
      if (!valuesEqual(data, next, schema)) write = { value: next }
    } else if (isEmpty(data, schema) && next !== undefined) {
      write = { value: next }
    }

    if (!write) {
      lastSiblingKey.current = siblingKey
      return
    }

    // Defer one tick: on mount, JsonFormsStateProvider's updateCore effect runs
    // after this child effect and resets core.data to the `data` prop, dropping
    // a synchronous write. The sibling key is recorded only once the write
    // lands, so a cancelled run still sees the sibling change.
    const pending = write
    const timer = setTimeout(() => {
      lastSiblingKey.current = siblingKey
      handleChange(path, pending.value)
    }, 0)
    return () => clearTimeout(timer)
  }, [source, siblingKey, sibling, data, schema, visible, enabled, formReadonly, path, handleChange])
}
