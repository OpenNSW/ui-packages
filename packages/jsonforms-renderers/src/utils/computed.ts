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

export interface ComputedResolution {
  status: 'ok' | 'error'
  value?: CellValue
  error?: string
}

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

  for (const [alias, config] of Object.entries(inputs)) {
    const { path, default: fallback } = typeof config === 'string' ? { path: config, default: undefined } : config
    const resolvedPath = parentPath ? `${parentPath}.${path}` : path
    const resolved = Resolve.data(rootData, resolvedPath) as CellValue | undefined

    if (resolved === null || resolved === undefined) {
      if (fallback === undefined) return undefined
      values[alias] = fallback
    } else {
      values[alias] = resolved
    }
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
