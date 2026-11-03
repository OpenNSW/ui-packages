import { withJsonFormsControlProps, useJsonForms } from '@jsonforms/react'
import type { ControlProps, JsonSchema } from '@jsonforms/core'
import { Box, Flex, Text, TextArea } from '@radix-ui/themes'
import { useEffect, useMemo } from 'react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { useIsRequired } from '../hooks/useIsRequired'
import { getErrorMessage } from '../utils/error'
import { computedInputsError, resolveComputedInputs } from '../utils/computed'
import type { TextFieldInput } from '../utils/computed'
import { renderTemplate } from '../utils/template'

interface XTextOptions {
  /**
   * alias -> path, resolved as x-computed's inputs are, plus a `join` aggregate that joins
   * array items into one text. See docs/template-text-fields.md.
   */
  inputs?: Record<string, TextFieldInput>
  /** The text, with `{alias}` for each input (utils/template.ts). */
  template: string
  /**
   * false (default): read-only, always re-rendered and saved.
   * true: a prefill, filled once while the field has never had a value, then the user's.
   */
  editable?: boolean
}

type TemplateTextControlProps = ControlProps & {
  schema: JsonSchema & { 'x-text'?: XTextOptions }
}

type Outcome = { status: 'ok'; text: string } | { status: 'error'; error: string } | { status: 'unavailable' }

const EMPTY_INPUTS: Record<string, TextFieldInput> = {}

const TemplateTextControl = ({
  data,
  handleChange,
  path,
  label,
  schema,
  rootSchema,
  required,
  errors,
  enabled,
  visible = true,
}: TemplateTextControlProps) => {
  useClearWhenHidden(visible, path, handleChange)
  const showRequired = useIsRequired(path, required, visible)

  const xText = schema?.['x-text']
  const inputs = xText?.inputs ?? EMPTY_INPUTS
  const template = xText?.template
  const editable = xText?.editable === true

  // Read from the whole form's data on every render, so a change to an input
  // anywhere in the form re-renders the text, as ComputedControl does.
  const ctx = useJsonForms()
  const locale = ctx.i18n?.locale
  const formReadonly = ctx.readonly === true
  const parentPath = path.split('.').slice(0, -1).join('.')

  // A schema mistake is shown on the field rather than left as a silent "Not yet available".
  const configError =
    typeof template === 'string' ? computedInputsError(inputs, true) : "x-text has no template, or one that isn't text."
  const values = configError
    ? undefined
    : resolveComputedInputs(ctx.core?.data, parentPath, inputs, { rootSchema, locale })
  // A stable key: values is a fresh object on every render.
  const valuesKey = values === undefined ? null : JSON.stringify(values)

  const outcome: Outcome = useMemo(() => {
    if (configError) return { status: 'error', error: configError }
    if (values === undefined || typeof template !== 'string') return { status: 'unavailable' }
    return { status: 'ok', text: renderTemplate(template, values).trim() }
    // values is keyed by valuesKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configError, valuesKey, template])

  const text = outcome.status === 'ok' ? outcome.text : undefined

  useEffect(() => {
    // Hidden: useClearWhenHidden has cleared the value. A form that's
    // read-only as a whole, such as a submitted record, is never rewritten.
    if (!visible || formReadonly) return

    let next: string | undefined
    if (editable) {
      // A prefill: filled once, while the field has never had a value, and
      // the user's from then on. A field the user cleared holds "", so it
      // stays empty. A disabled field belongs to someone else's step, so it
      // isn't this user's to fill.
      const neverSet = data === undefined || data === null
      if (!enabled || !text || !neverSet) return
      next = text
    } else {
      // Read-only: always the current text. A missing input, an error or an
      // empty result saves no value, so no stale text is left behind.
      next = text || undefined
      if (next === data) return
    }

    // One microtask later: on the first render, JsonForms' own effect runs
    // after this one and resets its store to the `data` it was given, which
    // would drop a write made now (#146, which ComputedControl's clears on
    // mount meet too). This relies on React running a commit's effects in one
    // synchronous pass, the provider's among them. Replace it with #146's
    // shared fix once that lands.
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) handleChange(path, next)
    })
    return () => {
      cancelled = true
    }
    // handleChange and path are stable for a mounted control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, data, editable, enabled, visible, formReadonly])

  if (!visible) return null

  const isValid = errors.length === 0
  const description = schema.description && (
    <Text size="1" color="gray">
      {schema.description}
    </Text>
  )
  const templateError = outcome.status === 'error' && (
    <Text size="1" color="red">
      {outcome.error}
    </Text>
  )

  if (editable) {
    return (
      <Box mb="4">
        <Flex direction="column" gap="1">
          <Text as="label" size="2" weight="bold" htmlFor={path}>
            {label} {showRequired && <Text color="red">*</Text>}
          </Text>
          <TextArea
            id={path}
            value={typeof data === 'string' ? data : ''}
            // A cleared field holds "", not undefined as TextControl's does: undefined
            // is a field never filled, which the effect above would fill again.
            onChange={(e) => handleChange(path, e.target.value)}
            disabled={!enabled || formReadonly}
            color={!isValid ? 'red' : undefined}
            resize="vertical"
            rows={Math.min(10, Math.max(3, (typeof data === 'string' ? data : '').split('\n').length + 1))}
          />
          {!isValid && (
            <Text color="red" size="1">
              {getErrorMessage(errors, label)}
            </Text>
          )}
          {templateError}
          {description}
        </Flex>
      </Box>
    )
  }

  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold">
          {label}
        </Text>
        {outcome.status === 'unavailable' ? (
          <Text size="2" color="gray">
            Not yet available.
          </Text>
        ) : outcome.status === 'error' ? (
          templateError
        ) : outcome.text ? (
          <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>
            {outcome.text}
          </Text>
        ) : (
          <Text size="2" color="gray">
            None.
          </Text>
        )}
        {description}
      </Flex>
    </Box>
  )
}

const JsonFormsTemplateTextControl = withJsonFormsControlProps(TemplateTextControl)
export default JsonFormsTemplateTextControl
