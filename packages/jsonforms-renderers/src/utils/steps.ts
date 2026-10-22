import {
  type Categorization,
  type Category,
  type ControlElement,
  type JsonFormsCore,
  type JsonSchema,
  type Translator,
  type UISchemaElement,
  composePaths,
  encode,
  createLabelDescriptionFrom,
  defaultTranslator,
  getControlPath,
  getI18nKey,
  isVisible,
  Resolve,
  toDataPath,
} from '@jsonforms/core'

/** An error in the form's state: JSON Forms' own, or one the host added. */
export type FormError = NonNullable<JsonFormsCore['errors']>[number]

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

/** True when `path` is `base` or inside it. */
function within(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}.`)
}

/**
 * The label a control shows, for naming it in a step's error summary: JSON
 * Forms' own label and i18n key for the control. `path` is its full data path.
 */
export function controlLabel(
  control: ControlElement,
  rootSchema: JsonSchema,
  path = toDataPath(control.scope),
  translate: Translator = defaultTranslator,
): string {
  const resolved = Resolve.schema(rootSchema, control.scope, rootSchema)
  const label = createLabelDescriptionFrom(control, resolved).text
  return translate(getI18nKey(resolved, control, path, 'label'), label)
}

/**
 * The controls of each step that the form's errors point at, one entry per
 * control, in the order the step shows them. The stepper adds no checks of its
 * own: it only sorts the errors JSON Forms (and the host) already have into
 * steps. `steps` holds each step's controls; `path` is where the
 * Categorization sits in the data.
 *
 * An object the trader has not started is missing from the data, so AJV reports
 * one `required` error on it instead of errors on its fields. That error counts
 * for each field the schema requires inside the object, on whichever step shows
 * it. When no step shows one, it goes to the first control under the object,
 * so the step that holds the object is still flagged.
 */
export function stepProblems(
  steps: ControlElement[][],
  errors: FormError[],
  rootSchema: JsonSchema,
  path = '',
  translate: Translator = defaultTranslator,
): StepProblem[][] {
  const entries = steps.map((controls) => controls.map((control) => ({ control, path: controlPath(control, path) })))
  const flagged = steps.map(() => new Set<ControlElement>())
  const failing = failingPaths(errors, rootSchema)
  // Paths some control was flagged for, so a missing object whose fields were
  // found needs no stand-in.
  const found: string[] = []
  for (const { path: failed } of failing) {
    entries.forEach((step, i) =>
      step.forEach(({ control, path }) => {
        if (!within(failed, path)) return
        flagged[i].add(control)
        found.push(failed)
      }),
    )
  }
  // Deepest first, so a stand-in inside a nested object also covers the objects around it.
  const unfound = failing
    .filter(({ path, missing }) => missing && !found.some((f) => within(f, path)))
    .sort((a, b) => b.path.split('.').length - a.path.split('.').length)
  for (const { path: failed } of unfound) {
    if (found.some((f) => within(f, failed))) continue
    const under = ({ path }: { path: string }) => path.startsWith(`${failed}.`)
    const i = entries.findIndex((step) => step.some(under))
    if (i === -1) continue
    flagged[i].add(entries[i].find(under)!.control)
    found.push(failed)
  }
  return entries.map((step, i) =>
    step
      .filter(({ control }) => flagged[i].has(control))
      .map(({ control, path }) => ({ path, label: controlLabel(control, rootSchema, path, translate) })),
  )
}

/**
 * The dotted data path of each error, and of each field it leaves missing: a
 * `required` error on an object counts for every field the object requires, and
 * so on into the objects among them. `missing` marks a path absent from the data.
 */
function failingPaths(errors: FormError[], rootSchema: JsonSchema): { path: string; missing: boolean }[] {
  const paths = new Map<string, boolean>()
  const addMissing = (path: string, depth: number) => {
    if (paths.get(path) === true) return
    paths.set(path, true)
    // A schema can refer to itself: stop well past any form's nesting.
    if (depth > 16) return
    const schema = schemaAt(rootSchema, path)
    for (const name of schema?.required ?? []) addMissing(composePaths(path, name), depth + 1)
  }
  for (const error of errors) {
    const path = getControlPath(error) as string
    if (error.keyword === 'required' && path !== '') addMissing(path, 0)
    else if (!paths.has(path)) paths.set(path, false)
  }
  return [...paths].map(([path, missing]) => ({ path, missing }))
}

/** The schema of the value at a dotted data path, or undefined. */
function schemaAt(rootSchema: JsonSchema, path: string): JsonSchema | undefined {
  const scope = path
    .split('.')
    .map((key) => (/^\d+$/.test(key) ? 'items' : `properties/${encode(key)}`))
    .join('/')
  return Resolve.schema(rootSchema, `#/${scope}`, rootSchema)
}

/** What a step not yet reached holds, for the note under it in the step list. */
export interface StepSummary {
  kind: 'items' | 'fields'
  count: number
}

/** The rows of a list on the step once it has some ("2 items added"), otherwise its number of fields. */
export function stepSummary(controls: ControlElement[], data: unknown, path = ''): StepSummary {
  const rows = controls
    .map((c) => valueAt(data, controlPath(c, path)))
    .find((v) => Array.isArray(v) && v.length > 0) as unknown[] | undefined
  if (rows) return { kind: 'items', count: rows.length }
  return { kind: 'fields', count: controls.length }
}

/** True when any of a step's controls holds a value, as it does in a saved draft. */
export function hasAnswers(controls: ControlElement[], data: unknown, path = ''): boolean {
  return controls.some((c) => {
    const value = valueAt(data, controlPath(c, path))
    return value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)
  })
}

/** The value at a dotted data path, or undefined. */
function valueAt(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur == null || typeof cur !== 'object') return undefined
    return (cur as Record<string, unknown>)[key]
  }, data)
}
