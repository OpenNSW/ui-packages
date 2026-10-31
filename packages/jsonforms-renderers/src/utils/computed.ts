import { Resolve } from '@jsonforms/core'
import { describeFormulaError, evaluateFormulaWithVariables } from './spreadsheet'
import type { CellValue } from './spreadsheet'

// A bare string is shorthand for { path: thatString }. `default` is used
// when the resolved value is null/undefined — e.g. an optional upload that
// hasn't happened yet — so the computation can proceed instead of the whole
// field going "unavailable". `path` follows the same dot-joined convention
// every ControlProps.path already uses (see Resolve.data / Paths.compose in
// @jsonforms/core) — not a syntax invented for this feature.
export type ComputedInput = string | { path: string; default?: CellValue }

// An x-computed input that reduces one field across every item of an array:
// a `*` segment in `path` matches every item of the array at that point, and
// `aggregate` reduces the matched values to one number, e.g.
// { path: "blendsheet_data.*.assessed_levy", aggregate: "sum" }. The two go
// together: see aggregateProblem. Only x-computed takes one
// (resolveComputedInputs); a row-number template's inputs stay single values.
export type ComputedAggregateInput = { path: string; default?: CellValue; aggregate: ComputedAggregate }

export type ComputedFieldInput = ComputedInput | ComputedAggregateInput

export type ComputedAggregate = 'sum' | 'min' | 'max' | 'average' | 'count'

const AGGREGATES: readonly ComputedAggregate[] = ['sum', 'min', 'max', 'average', 'count']
const WILDCARD = '*'

export interface ComputedResolution {
  status: 'ok' | 'error'
  value?: CellValue
  error?: string
}

// One input, relative to `parentPath`; its `default` stands in for null/undefined. undefined means missing.
export function resolveComputedInput(
  rootData: unknown,
  parentPath: string,
  input: ComputedInput,
): CellValue | undefined {
  const { path, default: fallback } = typeof input === 'string' ? { path: input, default: undefined } : input
  const resolved = Resolve.data(rootData, parentPath ? `${parentPath}.${path}` : path) as CellValue | undefined
  return resolved === null || resolved === undefined ? fallback : resolved
}

// A misconfigured aggregate input, described for the field to show, or
// undefined when every input is fine.
export function computedInputsError(inputs: Record<string, ComputedFieldInput>): string | undefined {
  for (const [alias, input] of Object.entries(inputs)) {
    const problem = aggregateProblem(input)
    if (problem !== undefined) return `Input "${alias}" ${problem}`
  }
  return undefined
}

// What's wrong with an input's `*`/`aggregate` pairing, or undefined when
// nothing is. The one place that rule lives: computedInputsError words it for
// the field to show, and resolveAggregateInput won't aggregate what it rejects.
function aggregateProblem(input: ComputedFieldInput): string | undefined {
  const path = typeof input === 'string' ? input : input.path
  const aggregate = aggregateOf(input)
  if (aggregate === undefined) return hasWildcard(path) ? 'has a * in its path but no aggregate.' : undefined
  if (!isAggregate(aggregate)) {
    return `has an unknown aggregate ${JSON.stringify(aggregate)}; use one of ${AGGREGATES.join(', ')}.`
  }
  if (!hasWildcard(path)) return 'has an aggregate but no * in its path.'
  return undefined
}

const aggregateOf = (input: ComputedFieldInput): unknown =>
  typeof input === 'string' || !('aggregate' in input) ? undefined : input.aggregate

// Has either half of an aggregate, so it's resolved (or rejected) as one.
const isAggregateInput = (input: ComputedFieldInput): boolean =>
  aggregateOf(input) !== undefined || hasWildcard(typeof input === 'string' ? input : input.path)

const hasWildcard = (path: string): boolean => path.split('.').includes(WILDCARD)

const isAggregate = (value: unknown): value is ComputedAggregate => AGGREGATES.includes(value as ComputedAggregate)

// One aggregate input, relative to `parentPath`. undefined means missing,
// including an input aggregateProblem rejects — which ComputedControl shows
// as an error instead, through computedInputsError.
function resolveAggregateInput(rootData: unknown, parentPath: string, input: ComputedFieldInput): number | undefined {
  if (typeof input === 'string' || aggregateProblem(input) !== undefined) return undefined
  const { path, default: fallback, aggregate } = input as ComputedAggregateInput
  return resolveAggregate(rootData, parentPath ? `${parentPath}.${path}` : path, aggregate, fallback)
}

// Every value the wildcard path matches, each `*` expanding to the items of
// the array at that point. Nothing at an array a `*` stands for — an array
// never touched, or an item's inner array not added yet — counts as no items,
// the same as an empty array. undefined when a value there isn't an array,
// which is a real mistake. A matched item without a value comes back as
// undefined, in its place.
function collectWildcard(data: unknown, segments: string[]): unknown[] | undefined {
  const index = segments.indexOf(WILDCARD)
  const head = segments.slice(0, index)
  const array: unknown = head.length ? Resolve.data(data, head.join('.')) : data
  if (array === null || array === undefined) return []
  if (!Array.isArray(array)) return undefined

  const rest = segments.slice(index + 1)
  const values: unknown[] = []
  for (const item of array) {
    if (rest.includes(WILDCARD)) {
      const nested = collectWildcard(item, rest)
      if (nested === undefined) return undefined
      values.push(...nested)
    } else {
      values.push(rest.length ? Resolve.data(item, rest.join('.')) : item)
    }
  }
  return values
}

// Reduces the matched values to one number. `count` is how many items
// matched, whatever their values, so `rows.*` counts rows. For the rest, each
// matched value must be a finite number, or else `fallback` stands in for it;
// with no usable fallback, the whole input is missing, as a single missing
// input is, rather than a total over only some items. No matches at all: sum
// and count are 0, and min, max and average are missing, since they have no
// value over nothing.
function resolveAggregate(
  rootData: unknown,
  fullPath: string,
  aggregate: ComputedAggregate,
  fallback: CellValue | undefined,
): number | undefined {
  const matched = collectWildcard(rootData, fullPath.split('.'))
  if (matched === undefined) return undefined
  if (aggregate === 'count') return matched.length

  const numbers: number[] = []
  for (const value of matched) {
    const number = isFiniteNumber(value) ? value : fallback
    if (!isFiniteNumber(number)) return undefined
    numbers.push(number)
  }

  switch (aggregate) {
    case 'sum':
      return numbers.reduce((total, number) => total + number, 0)
    case 'min':
      return numbers.length ? Math.min(...numbers) : undefined
    case 'max':
      return numbers.length ? Math.max(...numbers) : undefined
    case 'average':
      return numbers.length ? numbers.reduce((total, number) => total + number, 0) / numbers.length : undefined
  }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

// Pure, synchronous. Resolves each alias in `inputs` against `rootData`,
// relative to `parentPath` — the computed control's own containing object
// (e.g. a control at `blendsheet_data.0.total` passes parentPath
// `blendsheet_data.0`, so `"sales.derivations.total_sales.value"` reaches
// `blendsheet_data.0.sales.derivations...`, the SAME array item).
//
// For each alias: resolve the path; if it's null/undefined and a `default`
// was given, use the default; if null/undefined with no default, the WHOLE
// result is undefined — the formula short-circuits as "not yet available"
// rather than attempting a partial computation. An upstream-errored
// derivation already has `value: null` by construction (see
// utils/spreadsheet/process.ts), so it naturally takes the same
// default-or-unavailable path as a value that's simply missing — no separate
// lookup of a sibling `.error` key is needed to get *a* signal, just not a
// maximally-specific one.
export function resolveComputedInputs(
  rootData: unknown,
  parentPath: string,
  inputs: Record<string, ComputedFieldInput>,
): Record<string, CellValue> | undefined {
  const values: Record<string, CellValue> = {}

  for (const [alias, input] of Object.entries(inputs)) {
    const value = isAggregateInput(input)
      ? resolveAggregateInput(rootData, parentPath, input)
      : resolveComputedInput(rootData, parentPath, input)
    if (value === undefined) return undefined
    values[alias] = value
  }

  return values
}

// Pure, async, never throws — thin wrapper over evaluateFormulaWithVariables
// with this package's own error-message contract (describeFormulaError).
export async function evaluateComputedFormula(
  values: Record<string, CellValue>,
  formula: string,
): Promise<ComputedResolution> {
  try {
    const value = await evaluateFormulaWithVariables(values, formula)
    return { status: 'ok', value }
  } catch (err) {
    return { status: 'error', error: describeFormulaError(err) }
  }
}

// Number -> fixed decimals; Date -> locale date string; anything else ->
// String(); null/undefined -> ''.
export function formatComputedValue(value: CellValue | null | undefined, decimals: number): string {
  if (value == null) return ''
  if (typeof value === 'number') return value.toFixed(clampDecimals(decimals))
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

// Number.prototype.toFixed throws outside [0, 100] and for non-finite input
// — clamp rather than let a misconfigured x-computed.decimals crash rendering.
function clampDecimals(decimals: number): number {
  if (!Number.isFinite(decimals)) return 0
  return Math.min(100, Math.max(0, Math.trunc(decimals)))
}
