import { type ControlElement, type UISchemaElement, type JsonSchema, type Layout, Resolve } from '@jsonforms/core'
import { readByPath } from '../../utils/objectPath'

export interface FillEntry {
  // where to write, relative to this group's own path — or an absolute form path when `absolute: true`
  path: string
  // dot-path into the source value; '' means "the whole value"
  from: string
  absolute?: boolean
}

export interface AutoFillOptions {
  // relative dot-path (from this group's own path) to the Control declared in `elements` that supplies
  // fill values. A source control can optionally publish a richer value than what it writes to form data
  // (see AutoFillSourceContext) — e.g. SearchSelectControl publishes the full selected record while only
  // writing { value, label } to data. When nothing is published, the control's own form value is used
  // as-is. Either way, the group doesn't care what kind of control produced the value, only what's there.
  source: string
  // explicit overrides — for response keys that don't match a sibling's own path, reshaping, or wholesale
  // drops. everything else is auto-matched: a descendant Control whose own relative path matches a key in
  // the source value, and whose schema type is compatible with that value, is filled automatically — which
  // is exactly "the source value already matches this group's schema" and needs no mapping at all.
  fill?: FillEntry[]
}

export interface AutoTarget {
  control: ControlElement
  relativePath: string
}

export interface FillUpdate {
  // relative to the group's own path, or an absolute form path when `absolute` is true
  path: string
  value: unknown
  absolute?: boolean
}

// container element types this walks into to find fillable Control leaves — a nested AutoFillGroup
// is its own independent source/fill boundary and is deliberately left opaque, not recursed into
const CONTAINER_TYPES = new Set(['VerticalLayout', 'HorizontalLayout', 'Group', 'Categorization', 'Category'])

export function collectControlElements(elements: UISchemaElement[], acc: ControlElement[] = []): ControlElement[] {
  for (const el of elements) {
    if (el.type === 'Control' && (el as ControlElement).scope) {
      acc.push(el as ControlElement)
    } else if (CONTAINER_TYPES.has(el.type) && 'elements' in el) {
      collectControlElements(el.elements, acc)
    }
  }
  return acc
}

export function isTypeCompatible(schemaType: string | string[] | undefined, value: unknown): boolean {
  if (!schemaType) return true // unknown schema type — don't block; AJV will catch a real mismatch on submit
  const types = Array.isArray(schemaType) ? schemaType : [schemaType]
  return types.some((t) => {
    switch (t) {
      case 'string':
        return typeof value === 'string'
      case 'number':
      case 'integer':
        return typeof value === 'number'
      case 'boolean':
        return typeof value === 'boolean'
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'array':
        return Array.isArray(value)
      case 'null':
        return value === null
      default:
        return true
    }
  })
}

// cheap structural equality for JSON-shaped form data — enough to tell "still what we filled" apart
// from "the user has since edited this field", not a general-purpose deep-equal
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

// Decides what to write when the source has a value: explicit `fill` entries first (each resolved
// against the source value by its `from` dot-path), then auto-matched siblings — a descendant Control
// whose own relative path exists as a key in the source value and whose schema type is compatible.
// Pure: takes everything it needs as arguments, only side effect is a console.warn on a skip.
export function computeAutoFillUpdates(
  autoFill: AutoFillOptions,
  autoTargets: AutoTarget[],
  schema: JsonSchema,
  sourceValue: unknown,
): FillUpdate[] {
  const explicit = autoFill.fill ?? []
  const explicitRelPaths = new Set(explicit.filter((f) => !f.absolute).map((f) => f.path))
  const updates: FillUpdate[] = []

  explicit.forEach((entry) => {
    const { found, value } = readByPath(sourceValue, entry.from)
    if (!found) {
      console.warn(`[AutoFillGroup] "${entry.from}" not found in the source value for fill target "${entry.path}"`)
      return
    }
    updates.push({ path: entry.path, value, absolute: entry.absolute })
  })

  autoTargets.forEach(({ control, relativePath }) => {
    if (explicitRelPaths.has(relativePath)) return // explicit fill wins
    const { found, value } = readByPath(sourceValue, relativePath)
    if (!found) return // not every sibling needs to come from this source

    const targetSchema = Resolve.schema(schema, control.scope, schema)
    if (!isTypeCompatible(targetSchema?.type, value)) {
      console.warn(
        `[AutoFillGroup] source field "${relativePath}" (${typeof value}) does not match schema type "${String(targetSchema?.type)}" — skipped`,
      )
      return
    }
    updates.push({ path: relativePath, value })
  })

  return updates
}

// Decides what to clear when the source is cleared: only relative paths this group actually wrote,
// and only if the field still holds the value it wrote there — if the user has since edited it, it's
// left alone. Absolute `fill` targets aren't covered here; they're cleared unconditionally by the
// caller since this component can't read back data outside its own scope to compare.
export function computeClearUpdates(filled: Map<string, unknown>, data: unknown): string[] {
  const toClear: string[] = []
  filled.forEach((filledValue, relativePath) => {
    const current = readByPath(data, relativePath)
    if (current.found && sameValue(current.value, filledValue)) {
      toClear.push(relativePath)
    }
  })
  return toClear
}

export type AutoFillGroupLayout = Layout & {
  label?: string
  options?: { autoFill?: AutoFillOptions }
}
