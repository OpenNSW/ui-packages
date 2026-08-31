import { withJsonFormsControlProps, useJsonForms } from '@jsonforms/react'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Flex, Spinner, Text } from '@radix-ui/themes'
import { useEffect, useState } from 'react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { evaluateComputedFormula, formatComputedValue, resolveComputedInputs } from '../utils/computed'
import type { ComputedInput } from '../utils/computed'
import { isEditable } from '../utils/editable'
import type { CellValue } from '../utils/spreadsheet'

interface XComputedOptions {
  /** alias -> path (shorthand) or { path, default }, relative to this control's own parent object. */
  inputs: Record<string, ComputedInput>
  /** Formula written in terms of the aliases above, e.g. "total_sales + total_imported + total_blend_balance". */
  formula: string
  /** Display template; "{value}" is replaced by the formatted number. Default "{value}". */
  format?: string
  /** Decimal places. Default 2. */
  decimals?: number
}

type ComputedControlProps = ControlProps & {
  schema: JsonSchema & { 'x-computed'?: XComputedOptions }
}

type Status = 'unavailable' | 'loading' | 'ok' | 'error'

const DEFAULT_FORMAT = '{value}'
const DEFAULT_DECIMALS = 2
const EMPTY_INPUTS: Record<string, ComputedInput> = {}

const ComputedControl = ({
  data,
  handleChange,
  path,
  label,
  schema,
  visible = true,
  enabled,
  readonly,
}: ComputedControlProps) => {
  useClearWhenHidden(visible, path, handleChange, null)

  const xComputed = schema?.['x-computed']
  const inputs = xComputed?.inputs ?? EMPTY_INPUTS
  const formula = xComputed?.formula ?? ''
  const format = xComputed?.format ?? DEFAULT_FORMAT
  const decimals = xComputed?.decimals ?? DEFAULT_DECIMALS
  // Not editable: there's nothing for this field to react to (no sibling
  // edits can happen), so it must never recompute — just trust whatever's
  // already persisted. Mirrors SpreadsheetControl, which never reprocesses
  // an already-persisted value on render either.
  const canEdit = isEditable(enabled, readonly)

  // Every render, not just inside the effect below — this is what lets the
  // effect correctly re-fire the moment a SIBLING's data changes (e.g. a
  // spreadsheet re-upload, or another computed field updating), since only
  // ctx.core.data changes on that write, never this control's own path/data.
  const ctx = useJsonForms()
  const parentPath = path.split('.').slice(0, -1).join('.')
  const resolvedInputs = resolveComputedInputs(ctx.core?.data, parentPath, inputs)
  // Cheap, stable dependency key for the effect below — resolvedInputs is a
  // fresh object every render even when its contents are unchanged.
  const inputsKey = resolvedInputs ? JSON.stringify(resolvedInputs) : null

  // Lazy initializers so a readonly mount with an already-correct persisted
  // value renders it immediately — no "Not yet available" -> "Computing…"
  // flash while the (unnecessary, in this case) effect below would
  // otherwise still be settling.
  const [status, setStatus] = useState<Status>(() => (!canEdit && data != null ? 'ok' : 'unavailable'))
  const [value, setValue] = useState<CellValue | null>(() => (!canEdit ? ((data as CellValue | null) ?? null) : null))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canEdit) {
      // Readonly: trust whatever's already persisted, never recompute.
      setStatus(data != null ? 'ok' : 'unavailable')
      setValue((data as CellValue | null) ?? null)
      setError(null)
      return
    }

    let cancelled = false

    if (resolvedInputs === undefined) {
      setStatus('unavailable')
      setError(null)
      setValue(null)
      // Loop-safety guard: this control only ever writes to its own path, so
      // a sibling's data (which this effect otherwise depends on) doesn't
      // change from that write — but guard anyway.
      if (data !== null) handleChange(path, null)
      return
    }

    // Synchronous, before the async formula evaluation below — the engine's
    // formula-parsing libraries are dynamically imported on first use (see
    // evaluateExpression's own module comment), so the very first evaluation
    // per page load can take noticeably longer than subsequent ones.
    setStatus('loading')

    void evaluateComputedFormula(resolvedInputs, formula).then((result) => {
      if (cancelled) return

      if (result.status === 'error') {
        setStatus('error')
        setError(result.error ?? 'Unable to compute value.')
        setValue(null)
        if (data !== null) handleChange(path, null)
        return
      }

      const resolved = result.value ?? null
      setStatus('ok')
      setError(null)
      setValue(resolved)
      if (resolved !== (data ?? null)) handleChange(path, resolved)
    })

    return () => {
      cancelled = true
    }
    // Deliberately keyed on the resolved inputs, formula, and canEdit only —
    // not on `data`/`path`/`handleChange`, which this effect itself writes
    // to. canEdit flipping true (readonly -> editable) re-fires this to
    // resume reactive recomputation; flipping false (editable -> readonly)
    // re-fires it into the early-return above, syncing state to whatever
    // data was at that moment and settling there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, formula, canEdit])

  if (visible === false) {
    return null
  }

  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold">
          {label}
        </Text>
        {status === 'unavailable' ? (
          <Text size="2" color="gray">
            Not yet available.
          </Text>
        ) : status === 'loading' ? (
          <Flex align="center" gap="2">
            <Spinner size="1" />
            <Text size="2" color="gray">
              Computing…
            </Text>
          </Flex>
        ) : status === 'error' ? (
          <Text size="2" color="red">
            {error}
          </Text>
        ) : (
          <Text size="2">{format.split(DEFAULT_FORMAT).join(formatComputedValue(value, decimals))}</Text>
        )}
        {schema.description && (
          <Text size="1" color="gray">
            {schema.description}
          </Text>
        )}
      </Flex>
    </Box>
  )
}

export default withJsonFormsControlProps(ComputedControl)
