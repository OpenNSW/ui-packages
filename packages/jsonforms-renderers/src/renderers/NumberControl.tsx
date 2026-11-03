import { type ControlProps, isNumberControl, type RankedTester, rankWith, isIntegerControl, or } from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { TextField, Text, Flex, Box } from '@radix-ui/themes'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { getErrorMessage } from '../utils/error'
import { useAnswerPlaceholder, useReadOnlyMark } from '../contexts/formReview'
import { ReadOnlyLock } from './ReadOnlyLock'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { useDefaultFrom } from '../hooks/useDefaultFrom'
import { useIsRequired } from '../hooks/useIsRequired'

const BLOCKED_NUMBER_KEYS = new Set(['-', '+', 'e', 'E'])

export const NumberControl = ({
  data,
  handleChange,
  path,
  label,
  required,
  errors,
  uischema,
  schema,
  enabled,
  visible = true,
}: ControlProps) => {
  useClearWhenHidden(visible, path, handleChange)
  useDefaultFrom(data, path, schema, enabled, visible, handleChange)
  const showRequired = useIsRequired(path, required, visible)
  const locked = useReadOnlyMark(enabled)
  const placeholderProps = useAnswerPlaceholder(uischema.options?.placeholder as string | undefined)

  if (visible === false) {
    return null
  }

  const isValid = errors.length === 0

  const exclusiveMinimum = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum : undefined
  const minimum = typeof schema.minimum === 'number' ? schema.minimum : undefined
  const minBound = exclusiveMinimum ?? minimum
  const blockSignedKeys = minBound !== undefined && minBound >= 0
  const step = typeof schema.multipleOf === 'number' ? schema.multipleOf : schema.type === 'integer' ? 1 : undefined

  const handleNumberChange = (value: string) => {
    if (value === '') {
      handleChange(path, undefined)
      return
    }
    const num = Number(value)
    if (!isNaN(num)) {
      handleChange(path, num)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (blockSignedKeys && BLOCKED_NUMBER_KEYS.has(e.key)) {
      e.preventDefault()
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    if (!blockSignedKeys) return
    const text = e.clipboardData.getData('text')
    if (/[-+eE]/.test(text)) {
      e.preventDefault()
    }
  }

  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold" htmlFor={path}>
          {label} {showRequired && <Text color="red">*</Text>}
        </Text>
        <TextField.Root
          type="number"
          value={data ?? ''}
          onChange={(e) => handleNumberChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          min={minBound}
          step={step}
          disabled={!enabled}
          {...placeholderProps}
          color={!isValid ? 'red' : undefined}
          id={path}
        >
          {locked && <ReadOnlyLock />}
        </TextField.Root>
        {!isValid && (
          <Text color="red" size="1">
            {getErrorMessage(errors, label)}
          </Text>
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

export const NumberControlTester: RankedTester = rankWith(2, or(isNumberControl, isIntegerControl))

export default withJsonFormsControlProps(NumberControl)
