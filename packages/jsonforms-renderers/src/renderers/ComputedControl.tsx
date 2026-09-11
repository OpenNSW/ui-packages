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
  // `undefined`, not `null` — this control only ever matches `type: 'number'`
  // schemas (see ComputedControlTester), and `null` doesn't satisfy that, so
  // clearing with null would add a spurious "must be number" on top of
  // whatever the real situation is. undefined means "no value", which is what
  // an uncomputed field genuinely is.
  useClearWhenHidden(visible, path, handleChange)

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
  // The WHOLE FORM's own readonly flag (whatever the consuming app passed to
  // <JsonForms readonly={...}>) — not this field's own enabled/readonly,
  // which never gates anything here (see the note below). Gates PERSISTING
  // only, not computing: while genuinely read-only (e.g. viewing a
  // previously-submitted record), writing a freshly recomputed value back
  // risks silently rewriting history if the formula/inputs have since
  // changed, and can trigger an unwanted autosave in a host app whose
  // onChange wiring is shared between edit and view screens.
  const formReadonly = ctx.readonly === true

  // No THIS FIELD's own enabled/readonly awareness here, deliberately —
  // x-computed's own presence on a field IS the complete signal that it's
  // entirely calculated, not manually entered. There's no legitimate case
  // where a schema author configures x-computed but wants recomputation
  // skipped: a field's own `readOnly`/`enabled` means "the user can't type
  // into this," never "stop calculating it" — this control has no editable
  // input to disable in the first place. A schema author who wants a
  // static, non-computed display value simply omits x-computed (falls to
  // the plain NumberControl instead). Contrast with SpreadsheetControl,
  // whose own-field `readOnly` genuinely means "don't accept a new upload"
  // — a real interactive gate this control doesn't have an equivalent of.
  // (The WHOLE FORM's readonly — `formReadonly` above — is a different,
  // legitimate signal; see the effect below.)
  //
  // Lazy initializers so an already-persisted value renders immediately on
  // mount — no "Not yet available" -> "Computing…" flash — regardless of
  // whether this mount will end up recomputing (it always will, once inputs
  // resolve; see the effect below for how it avoids re-flashing then too).
  const [status, setStatus] = useState<Status>(() => (typeof data === 'number' ? 'ok' : 'unavailable'))
  const [value, setValue] = useState<CellValue | null>(() => (typeof data === 'number' ? data : null))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return // don't touch anything while hidden — useClearWhenHidden already cleared data

    let cancelled = false

    // Always resolve/compute regardless of readonly — x-computed's presence
    // is itself the complete "always calculate" signal (see the comment
    // block above). PERSISTING that result is a different question: while
    // the whole form is genuinely read-only (formReadonly — not this
    // field's own schema readOnly, which stays irrelevant here), writing a
    // freshly recomputed value back risks silently rewriting a historical
    // record if the formula/inputs have since changed, and can trigger an
    // unwanted autosave in a host app that reacts to onChange. Render the
    // computed number and leave data alone instead.
    //
    // "No value" is persisted as `undefined`, never `null`: this control only
    // matches `type: 'number'` schemas, which `null` doesn't satisfy, so a
    // null would pile a spurious "must be number" on top of the real reason
    // the value is missing. Comparing against raw `data` (not `data ?? null`)
    // also means a legacy null left behind by an earlier version gets actively
    // cleared rather than treated as already-empty.
    const persist = (next: number | undefined) => {
      if (formReadonly) return
      // Loop-safety guard: this control only ever writes to its own path, so
      // a sibling's data (which this effect otherwise depends on) doesn't
      // change from that write — but guard anyway.
      if (next !== data) handleChange(path, next)
    }

    if (resolvedInputs === undefined) {
      setStatus('unavailable')
      setError(null)
      setValue(null)
      persist(undefined)
      return
    }

    // Only drop to the spinner when there's nothing already-good to keep
    // showing in its place — a recompute of an already-persisted value
    // settles silently instead of flashing "Computing…" every time a
    // sibling changes. The functional updater reads the CURRENT status
    // without needing it in the deps array (which would make this effect
    // re-fire on its own state changes).
    setStatus((current) => (current === 'ok' ? current : 'loading'))

    void evaluateComputedFormula(resolvedInputs, formula).then((result) => {
      if (cancelled) return

      // ComputedControlTester only matches type: 'number' schemas, but the
      // formula engine can still return a non-number (e.g. a CONCATENATE-
      // style expression yields a string) or a non-finite number (NaN,
      // Infinity — e.g. a malformed expression) — treat both as a
      // computation error rather than persisting schema-invalid data.
      const resolved =
        result.status === 'ok' && typeof result.value === 'number' && Number.isFinite(result.value)
          ? result.value
          : null

      if (resolved === null) {
        setStatus('error')
        setError(
          result.status === 'error' ? (result.error ?? 'Unable to compute value.') : 'Computed value must be a number.',
        )
        setValue(null)
        persist(undefined)
        return
      }

      setStatus('ok')
      setError(null)
      setValue(resolved)
      persist(resolved)
    })

    return () => {
      cancelled = true
    }
    // Deliberately keyed on the resolved inputs, formula, visible, and
    // formReadonly only — not on `data`/`path`/`handleChange`, which this
    // effect itself writes to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, formula, visible, formReadonly])

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

const JsonFormsComputedControl = withJsonFormsControlProps(ComputedControl)
export default JsonFormsComputedControl
