import {
  type Categorization,
  type Category,
  type ControlElement,
  type JsonFormsCore,
  type JsonSchema,
  type Translator,
  type UISchemaElement,
  composePaths,
  defaultTranslator,
  getI18nKey,
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
 * `path` is where the Categorization sits in the data ('' at the root).
 */
export function visibleControls(
  element: UISchemaElement,
  data: unknown,
  ajv: JsonFormsCore['ajv'],
  config: unknown,
  path = '',
): ControlElement[] {
  if (ajv && element.rule && !isVisible(element, data, path, ajv, config)) return []
  if (element.type === 'Control') return [element as ControlElement]
  const children = (element as { elements?: UISchemaElement[] }).elements
  if (!Array.isArray(children)) return []
  return children.flatMap((child) => visibleControls(child, data, ajv, config, path))
}

/** The full dotted data path of a control under a Categorization at `path`. */
export function controlPath(control: ControlElement, path = ''): string {
  return composePaths(path, toDataPath(control.scope))
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

/** True when `path` is `base` or inside it. */
function within(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}.`)
}

/**
 * The label a control shows, for naming it in a step's error summary: the
 * same text and i18n key JSON Forms gives the control itself. `path` is the
 * control's full data path.
 */
export function controlLabel(
  control: ControlElement,
  rootSchema: JsonSchema,
  path = toDataPath(control.scope),
  translate: Translator = defaultTranslator,
): string {
  const resolved = Resolve.schema(rootSchema, control.scope, rootSchema)
  const last = control.scope.split('/').pop() ?? ''
  const words = last.replace(/[_-]+/g, ' ').trim()
  const label =
    (typeof control.label === 'string' && control.label) ||
    resolved?.title ||
    words.charAt(0).toUpperCase() + words.slice(1)
  return translate(getI18nKey(resolved, control, path, 'label'), label)
}

/**
 * The controls of one step that still have an error or an empty required
 * value, one entry per control, in the order the step shows them. Error and
 * empty paths are from the data root; `path` is where the Categorization sits.
 */
export function stepProblems(
  controls: ControlElement[],
  errors: StepError[],
  emptyPaths: string[],
  rootSchema: JsonSchema,
  path = '',
  translate: Translator = defaultTranslator,
): StepProblem[] {
  const failing = [...errors.map(errorDataPath), ...emptyPaths]
  return controls
    .map((control) => ({ control, path: controlPath(control, path) }))
    .filter(({ path }) => failing.some((f) => within(f, path)))
    .map(({ control, path }) => ({ path, label: controlLabel(control, rootSchema, path, translate) }))
}

/** What a step not yet reached holds, for the note under it in the step list. */
export type StepSummary = { kind: 'items' | 'fields'; count: number } | { kind: 'optional' }

/**
 * The rows of a list on the step once it has some ("2 items added"),
 * otherwise its number of fields, or optional when none of them is required.
 */
export function stepSummary(controls: ControlElement[], data: unknown, rootSchema: JsonSchema, path = ''): StepSummary {
  const paths = controls.map((c) => controlPath(c, path))
  const rows = paths.map((p) => valueAt(data, p)).find((v) => Array.isArray(v) && v.length > 0) as unknown[] | undefined
  if (rows) return { kind: 'items', count: rows.length }
  if (!paths.some((p) => isRequiredAt(rootSchema, p))) return { kind: 'optional' }
  return { kind: 'fields', count: controls.length }
}

/** True when any of a step's controls holds a value, as it does in a saved draft. */
export function hasAnswers(controls: ControlElement[], data: unknown, path = ''): boolean {
  return controls.some((c) => {
    const value = valueAt(data, controlPath(c, path))
    return value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)
  })
}

function valueAt(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== 'object') return undefined
    return (cur as Record<string, unknown>)[key]
  }, data)
}

/**
 * Whether the value at a dotted data path is in its parent object's `required`
 * list. Plain `properties` and `items` only: no `$ref` and no conditional
 * `required`.
 */
export function isRequiredAt(rootSchema: JsonSchema, path: string): boolean {
  const segments = path.split('.')
  const key = segments.pop()
  let parent: JsonSchema | undefined = rootSchema
  for (const segment of segments) {
    const items: JsonSchema | undefined = parent?.items && !Array.isArray(parent.items) ? parent.items : undefined
    parent = /^\d+$/.test(segment) && items ? items : parent?.properties?.[segment]
    if (!parent) return false
  }
  return key !== undefined && (parent.required ?? []).includes(key)
}
