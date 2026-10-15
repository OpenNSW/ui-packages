/** Minimal AJV validate function shape (avoids a hard ajv dependency). */
export type SchemaValidateFunction = ((data: unknown) => boolean) & {
  errors?: Array<{
    keyword: string
    instancePath?: string
    params?: { missingProperty?: string }
  }> | null
}

/** Keywords that can make `required` depend on data (beyond a plain `required` array). */
const CONDITIONAL_SCHEMA_KEYS = ['if', 'allOf', 'anyOf', 'oneOf', 'dependentRequired', 'dependencies'] as const

/**
 * True when the root schema may express conditional required rules that
 * `@jsonforms/core`'s static `isRequired()` misses. Used to skip the per-
 * keystroke AJV clone/validate when a plain `required` array is enough.
 */
export function schemaHasConditionalRequired(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false
  const s = schema as Record<string, unknown>
  return CONDITIONAL_SCHEMA_KEYS.some((k) => s[k] != null)
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
    const seg = segments[i]!
    if (parent == null || typeof parent !== 'object') return root
    const next = (parent as Record<string, unknown>)[seg]
    if (next == null || typeof next !== 'object') return root
    parent = next as Record<string, unknown> | unknown[]
  }

  const last = segments[segments.length - 1]!
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
