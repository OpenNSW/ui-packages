import { type ControlProps, isStringControl, type RankedTester, rankWith } from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { useIsRequired } from '../hooks/useIsRequired'

import { TextField, Text, Flex, Box } from '@radix-ui/themes'
import { getErrorMessage } from '../utils/error'
import { useReadOnlyMark } from '../contexts/formReview'
import { ReadOnlyLock } from './ReadOnlyLock'

export const TextControl = ({
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
  const showRequired = useIsRequired(path, required, visible)
  const locked = useReadOnlyMark(enabled)

  if (visible === false) {
    return null
  }

  const isValid = errors.length === 0

  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold" htmlFor={path}>
          {label} {showRequired && <Text color="red">*</Text>}
        </Text>
        <TextField.Root
          value={data || ''}
          // A cleared field holds no value, as Number, Date and Select do, so a
          // required one fails JSON Schema's `required` like one never filled.
          onChange={(e) => handleChange(path, e.target.value === '' ? undefined : e.target.value)}
          disabled={!enabled}
          placeholder={uischema.options?.placeholder}
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

export const TextControlTester: RankedTester = rankWith(1, isStringControl)

export default withJsonFormsControlProps(TextControl)
