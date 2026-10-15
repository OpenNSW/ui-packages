/** Minimal AJV validate function shape (avoids a hard ajv dependency). */
export type SchemaValidateFunction = ((data: unknown) => boolean) & {
  errors?: Array<{
    keyword: string
    instancePath?: string
    params?: { missingProperty?: string }
  }> | null
}

/** Cache `schemaHasConditionalRequired` per schema object identity. */
const conditionalRequiredCache = new WeakMap<object, boolean>()

/**
 * True when the schema may express conditional required rules that
 * `@jsonforms/core`'s static `isRequired()` misses. Used to skip the per-
 * keystroke AJV clone/validate when a plain `required` array is enough.
 *
 * Walks the whole schema (properties, items, then/else, etc.), follows local
 * `$ref`s into `$defs` / `definitions`, and caches the result per schema object.
 * Property-level enum `oneOf` / `anyOf` that only list `const` options do not
 * count; branches that add `required` or further conditionals do.
 */
export function schemaHasConditionalRequired(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false
  const cached = conditionalRequiredCache.get(schema)
  if (cached !== undefined) return cached
  const result = scanForConditionalRequired(schema, schema as Record<string, unknown>, new Set())
  conditionalRequiredCache.set(schema, result)
  return result
}

function resolveLocalRef(root: Record<string, unknown>, ref: string): Record<string, unknown> | undefined {
  if (!ref.startsWith('#/')) return undefined
  const parts = ref.slice(2).split('/')
  let cur: unknown = root
  for (const part of parts) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur && typeof cur === 'object' ? (cur as Record<string, unknown>) : undefined
}

function scanForConditionalRequired(node: unknown, root: Record<string, unknown>, seen: Set<object>): boolean {
  if (!node || typeof node !== 'object') return false
  if (seen.has(node)) return false
  seen.add(node)

  const s = node as Record<string, unknown>

  if (s.if != null || s.dependentRequired != null || s.dependencies != null) return true

  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    const arr = s[key]
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue
      const branch = item as Record<string, unknown>
      if (Array.isArray(branch.required) && branch.required.length > 0) return true
      if (scanForConditionalRequired(branch, root, seen)) return true
    }
  }

  if (typeof s.$ref === 'string') {
    const target = resolveLocalRef(root, s.$ref)
    if (target && scanForConditionalRequired(target, root, seen)) return true
  }

  for (const key of ['then', 'else', 'not', 'contains', 'additionalProperties', 'items'] as const) {
    const child = s[key]
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      if (scanForConditionalRequired(child, root, seen)) return true
    }
  }

  if (Array.isArray(s.items)) {
    for (const item of s.items) {
      if (scanForConditionalRequired(item, root, seen)) return true
    }
  }

  for (const mapKey of ['properties', 'patternProperties', '$defs', 'definitions'] as const) {
    const map = s[mapKey]
    if (!map || typeof map !== 'object') continue
    for (const child of Object.values(map as Record<string, unknown>)) {
      if (scanForConditionalRequired(child, root, seen)) return true
    }
  }

  return false
}

/**
 * Deep-clone form data and remove the value at `path` (dot-separated, as
 * JSONForms uses). Used to ask AJV whether that property is currently required.
 */
export function cloneDataWithoutPath(data: unknown, path: string): unknown {
  const root = structuredClone(data === undefined || data === null ? {} : data)
  if (!path) return root

  const segments = path.split('.')
  let parent: Record<string, unknown> | unknown[] | null = root as Record<string, unknown> | unknown[]

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    if (parent == null || typeof parent !== 'object') return root
    const next = (parent as Record<string, unknown>)[seg]
    if (next == null || typeof next !== 'object') return root
    parent = next as Record<string, unknown> | unknown[]
  }

  const last = segments[segments.length - 1]
  if (parent != null && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[last]
  }
  return root
}

/** JSONForms path `a.b.0.c` -> AJV instancePath parent `/a/b/0`. */
export function parentInstancePath(path: string): string {
  const i = path.lastIndexOf('.')
  if (i === -1) return ''
  return '/' + path.slice(0, i).split('.').join('/')
}

export function propertyNameFromPath(path: string): string {
  if (!path) return ''
  const i = path.lastIndexOf('.')
  return i === -1 ? path : path.slice(i + 1)
}

function matchesRequiredError(error: NonNullable<SchemaValidateFunction['errors']>[number], path: string): boolean {
  if (error.keyword !== 'required') return false
  if (error.params?.missingProperty !== propertyNameFromPath(path)) return false
  return (error.instancePath ?? '') === parentInstancePath(path)
}

/**
 * True when submitting the form with this path empty would produce a
 * `required` AJV error for that property. Covers plain `required`,
 * `allOf`/`if`/`then`, `oneOf`, `dependentRequired`, etc., without parsing
 * those constructs by hand.
 */
export function isPathRequiredBySchema(
  path: string,
  rootData: unknown,
  validate: SchemaValidateFunction | undefined,
): boolean {
  if (!path || !validate) return false
  const without = cloneDataWithoutPath(rootData, path)
  validate(without)
  const errors = validate.errors
  if (!errors?.length) return false
  return errors.some((e) => matchesRequiredError(e, path))
}
