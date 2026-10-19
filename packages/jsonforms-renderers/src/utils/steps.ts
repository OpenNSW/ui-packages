import {
  type Categorization,
  type Category,
  type ControlElement,
  type JsonFormsCore,
  type JsonSchema,
  type UISchemaElement,
  isVisible,
  Resolve,
  toDataPath,
} from '@jsonforms/core'

/** Minimal AJV error shape the step checks read. */
export interface StepError {
  instancePath?: string
  keyword?: string
  params?: { missingProperty?: string }
}

/** A control the trader still has to fix before leaving a step. */
export interface StepProblem {
  /** Dotted data path of the control, the same string the controls use as their input id. */
  path: string
  label: string
}

/** True when a uischema asks for the stepper rather than tabs. */
export function isStepperUiSchema(uischema: unknown): boolean {
  if (!uischema || typeof uischema !== 'object') return false
  const u = uischema as { type?: unknown; options?: { variant?: unknown } }
  return u.type === 'Categorization' && u.options?.variant === 'stepper'
}

/** The Categories of a Categorization, skipping any other element type. */
export function categoriesOf(categorization: Categorization): Category[] {
  return categorization.elements.filter((e): e is Category => e.type === 'Category')
}

/**
 * Every Control under `element` that its rules currently show. A layout whose
 * rule hides it hides all of its controls too, as the layout renderers do.
 */
export function visibleControls(
  element: UISchemaElement,
  data: unknown,
  ajv: JsonFormsCore['ajv'],
  config: unknown,
): ControlElement[] {
  if (ajv && element.rule && !isVisible(element, data, '', ajv, config)) return []
  if (element.type === 'Control') return [element as ControlElement]
  const children = (element as { elements?: UISchemaElement[] }).elements
  if (!Array.isArray(children)) return []
  return children.flatMap((child) => visibleControls(child, data, ajv, config))
}

/** The dotted data path an AJV error points at, `required` errors included. */
export function errorDataPath(error: StepError): string {
  const segments = (error.instancePath ?? '').split('/').filter(Boolean)
  if (error.keyword === 'required' && error.params?.missingProperty) segments.push(error.params.missingProperty)
  return segments.join('.')
}

/**
 * Dotted paths of required values that are present but empty ("" or []).
 * JSON Schema `required` only checks presence, so AJV passes them, but a
 * trader who typed into a field and cleared it has not filled it in.
 */
export function emptyRequiredPaths(schema: JsonSchema | undefined, data: unknown, path = ''): string[] {
  if (!schema || typeof schema !== 'object') return []
  const out: string[] = []
  const join = (key: string | number) => (path ? `${path}.${key}` : String(key))

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    for (const key of schema.required ?? []) {
      if (key in obj && isEmpty(obj[key])) out.push(join(key))
    }
    for (const [key, sub] of Object.entries<JsonSchema>(schema.properties ?? {})) {
      if (obj[key] !== undefined) out.push(...emptyRequiredPaths(sub, obj[key], join(key)))
    }
  }

  if (Array.isArray(data) && schema.items && !Array.isArray(schema.items)) {
    const items = schema.items
    data.forEach((item: unknown, index) => out.push(...emptyRequiredPaths(items, item, join(index))))
  }

  return out
}

function isEmpty(value: unknown): boolean {
  if (value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  return Array.isArray(value) && value.length === 0
}

/** True when `path` is `controlPath` or inside it. */
function within(path: string, controlPath: string): boolean {
  return path === controlPath || path.startsWith(`${controlPath}.`)
}

/** The label a control shows, for naming it in a step's error summary. */
export function controlLabel(control: ControlElement, rootSchema: JsonSchema): string {
  if (typeof control.label === 'string' && control.label) return control.label
  const resolved = Resolve.schema(rootSchema, control.scope, rootSchema)
  if (resolved?.title) return resolved.title
  const last = control.scope.split('/').pop() ?? ''
  const words = last.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The controls of one step that still have an error or an empty required
 * value, one entry per control, in the order the step shows them.
 */
export function stepProblems(
  controls: ControlElement[],
  errors: StepError[],
  emptyPaths: string[],
  rootSchema: JsonSchema,
): StepProblem[] {
  const failing = [...errors.map(errorDataPath), ...emptyPaths]
  return controls
    .map((control) => ({ control, path: toDataPath(control.scope) }))
    .filter(({ path }) => failing.some((f) => within(f, path)))
    .map(({ control, path }) => ({ path, label: controlLabel(control, rootSchema) }))
}

/**
 * A short note on what a step not yet reached holds, for the step list:
 * "2 items added" once a list on it has rows, otherwise "4 fields", or
 * "Optional" when none of its fields is required.
 */
export function stepSummary(controls: ControlElement[], data: unknown, rootSchema: JsonSchema): string {
  const paths = controls.map((c) => toDataPath(c.scope))
  const rows = paths.map((p) => valueAt(data, p)).find((v) => Array.isArray(v) && v.length > 0) as unknown[] | undefined
  if (rows) return rows.length === 1 ? '1 item added' : `${rows.length} items added`
  const required = paths.some((p) => !p.includes('.') && (rootSchema.required ?? []).includes(p))
  if (!required) return 'Optional'
  return controls.length === 1 ? '1 field' : `${controls.length} fields`
}

function valueAt(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== 'object') return undefined
    return (cur as Record<string, unknown>)[key]
  }, data)
}
