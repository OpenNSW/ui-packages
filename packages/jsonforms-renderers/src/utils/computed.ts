import { Resolve } from '@jsonforms/core'
import { describeFormulaError, evaluateFormulaWithVariables } from './spreadsheet'
import type { CellValue } from './spreadsheet'

// A bare string is shorthand for { path: thatString }. `default` is used
// when the resolved value is null/undefined — e.g. an optional upload that
// hasn't happened yet — so the computation can proceed instead of the whole
// field going "unavailable". `path` follows the same dot-joined convention
// every ControlProps.path already uses (see Resolve.data / Paths.compose in
// @jsonforms/core) — not a syntax invented for this feature.
//
// A `*` segment in `path` matches every item of the array at that point, and
// `aggregate` reduces the matched values to one number, e.g.
// { path: "blendsheet_data.*.assessed_levy", aggregate: "sum" }. The two go
// together: see computedInputsError.
export type ComputedInput = string | { path: string; default?: CellValue; aggregate?: ComputedAggregate }

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
  const { path, default: fallback, aggregate } = typeof input === 'string' ? { path: input } : input
  const fullPath = parentPath ? `${parentPath}.${path}` : path
  if (aggregate !== undefined || hasWildcard(path)) {
    return isAggregate(aggregate) && hasWildcard(path)
      ? resolveAggregate(rootData, fullPath, aggregate, fallback)
      : undefined
  }
  const resolved = Resolve.data(rootData, fullPath) as CellValue | undefined
  return resolved === null || resolved === undefined ? fallback : resolved
}

// A misconfigured aggregate input, described for the field to show, or
// undefined when every input is fine. resolveComputedInput treats the same
// input as missing, so a caller that doesn't check still never computes from it.
export function computedInputsError(inputs: Record<string, ComputedInput>): string | undefined {
  for (const [alias, input] of Object.entries(inputs)) {
    if (typeof input === 'string') {
      if (hasWildcard(input)) return `Input "${alias}" has a * in its path but no aggregate.`
      continue
    }
    if (input.aggregate !== undefined && !isAggregate(input.aggregate)) {
      return `Input "${alias}" has an unknown aggregate "${String(input.aggregate)}"; use one of ${AGGREGATES.join(', ')}.`
    }
    if (input.aggregate !== undefined && !hasWildcard(input.path)) {
      return `Input "${alias}" has an aggregate but no * in its path.`
    }
    if (input.aggregate === undefined && hasWildcard(input.path)) {
      return `Input "${alias}" has a * in its path but no aggregate.`
    }
  }
  return undefined
}

const hasWildcard = (path: string): boolean => path.split('.').includes(WILDCARD)

const isAggregate = (value: unknown): value is ComputedAggregate => AGGREGATES.includes(value as ComputedAggregate)

// Every value the wildcard path matches, each `*` expanding to the items of
// the array at that point. undefined when an array a `*` stands for is
// missing or isn't an array — there's nothing to aggregate over, which is
// different from an empty array. A matched item without a value comes back
// as undefined, in its place.
function collectWildcard(data: unknown, segments: string[]): unknown[] | undefined {
  const index = segments.indexOf(WILDCARD)
  const head = segments.slice(0, index)
  const array: unknown = head.length ? Resolve.data(data, head.join('.')) : data
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

// Reduces the matched values to one number. Each matched value must be a
// finite number, or else `fallback` stands in for it; with no usable
// fallback, the whole input is missing, as a single missing input is, rather
// than a total over only some items. No matches at all: sum and count are 0,
// and min, max and average are missing, since they have no value over nothing.
function resolveAggregate(
  rootData: unknown,
  fullPath: string,
  aggregate: ComputedAggregate,
  fallback: CellValue | undefined,
): number | undefined {
  const matched = collectWildcard(rootData, fullPath.split('.'))
  if (matched === undefined) return undefined

  const numbers: number[] = []
  for (const value of matched) {
    const number = isFiniteNumber(value) ? value : fallback
    if (!isFiniteNumber(number)) return undefined
    numbers.push(number)
  }

  switch (aggregate) {
    case 'sum':
      return numbers.reduce((total, number) => total + number, 0)
    case 'count':
      return numbers.length
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
  inputs: Record<string, ComputedInput>,
): Record<string, CellValue> | undefined {
  const values: Record<string, CellValue> = {}

  for (const [alias, input] of Object.entries(inputs)) {
    const value = resolveComputedInput(rootData, parentPath, input)
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
