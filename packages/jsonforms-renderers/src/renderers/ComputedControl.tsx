import { withJsonFormsControlProps, useJsonForms } from '@jsonforms/react'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Flex, Spinner, Text } from '@radix-ui/themes'
import { useEffect, useState } from 'react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { evaluateComputedFormula, formatComputedValue, resolveComputedInputs } from '../utils/computed'
import type { ComputedInput } from '../utils/computed'
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

const ComputedControl = ({ data, handleChange, path, label, schema, visible = true }: ComputedControlProps) => {
  useClearWhenHidden(visible, path, handleChange, null)

  const xComputed = schema?.['x-computed']
  const inputs = xComputed?.inputs ?? EMPTY_INPUTS
  const formula = xComputed?.formula ?? ''
  const format = xComputed?.format ?? DEFAULT_FORMAT
  const decimals = xComputed?.decimals ?? DEFAULT_DECIMALS

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

  const [status, setStatus] = useState<Status>('unavailable')
  const [value, setValue] = useState<CellValue | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
    // Deliberately keyed on the resolved inputs and formula only — not on
    // `data`/`path`/`handleChange`, which this effect itself writes to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, formula])

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
