import {
  type ControlProps,
  isDateControl,
  isDateTimeControl,
  isTimeControl,
  or,
  type RankedTester,
  rankWith,
} from '@jsonforms/core'
import { withJsonFormsControlProps } from '@jsonforms/react'
import { TextField, Text, Flex, Box } from '@radix-ui/themes'
import { useEffect, type ReactNode } from 'react'
import { format, isValid } from 'date-fns'

import { useDefaultFrom } from '../hooks/useDefaultFrom'
import { useIsRequired } from '../hooks/useIsRequired'
import { getErrorMessage } from '../utils/error'
import { useReadOnlyMark } from '../contexts/formReview'
import { ReadOnlyLock } from './ReadOnlyLock'
import { timeInputValue, toRfc3339Time } from '../utils/time'

// RFC 3339 (e.g. 2026-06-05T12:30:00+05:30) with seconds and the local offset,
// which ajv's strict "date-time" format check requires. xxx writes +00:00, not
// Z, at UTC. A date and time with no offset is read as local time.
//
// A date input accepts years past 9999, which Date can't read. That text is
// written as it is, so the "date-time" check rejects it and the field shows why.
const toISODateTime = (dateStr: string, timeStr: string) => {
  const text = `${dateStr}T${timeStr}`
  const date = new Date(text)
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm:ssxxx") : text
}

type ShellProps = Pick<ControlProps, 'path' | 'label' | 'required' | 'errors'> & {
  description?: string
  children: ReactNode
}

const FieldShell = ({ path, label, required, errors, description, children }: ShellProps) => {
  const isValid = errors.length === 0
  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold" htmlFor={path}>
          {label} {required && <Text color="red">*</Text>}
        </Text>
        {children}
        {!isValid && (
          <Text color="red" size="1">
            {getErrorMessage(errors, label)}
          </Text>
        )}
        {description && (
          <Text size="1" color="gray">
            {description}
          </Text>
        )}
      </Flex>
    </Box>
  )
}

export const DateControl = ({
  data,
  handleChange,
  path,
  label,
  required,
  errors,
  schema,
  uischema,
  enabled,
  visible = true,
}: ControlProps) => {
  useEffect(() => {
    if (visible === false) {
      handleChange(path, undefined)
    }
  }, [visible, path, handleChange])
  useDefaultFrom(data, path, schema, enabled, visible, handleChange)
  const showRequired = useIsRequired(path, required, visible)
  const locked = useReadOnlyMark(enabled)

  if (visible === false) {
    return null
  }
  const isValid = errors.length === 0
  const value: string = typeof data === 'string' ? data : ''
  // Seconds spinner is opt-in. Omitted / false keeps hour+minute only.
  // Stored values always include seconds so AJV format "time" still passes.
  const showSeconds = uischema?.options?.showSeconds === true
  const timeStep = showSeconds ? 1 : 60

  const shell = (children: ReactNode) => (
    <FieldShell path={path} label={label} required={showRequired} errors={errors} description={schema.description}>
      {children}
    </FieldShell>
  )

  // Time-only: native picker is plenty.
  if (schema.format === 'time') {
    return shell(
      <TextField.Root
        type="time"
        step={timeStep}
        value={timeInputValue(value, showSeconds)}
        onChange={(e) => handleChange(path, toRfc3339Time(e.target.value))}
        disabled={!enabled}
        color={!isValid ? 'red' : undefined}
        id={path}
      >
        {locked && <ReadOnlyLock />}
      </TextField.Root>,
    )
  }

  // date and date-time share the same date input; date-time appends a native time input.
  const hasTime = schema.format === 'date-time'
  const [datePart = '', timeRaw = ''] = value.split('T')
  const timeForInput = timeInputValue(timeRaw, showSeconds)

  const commit = (nextDate: string, nextTime: string) => {
    if (!nextDate) {
      handleChange(path, undefined)
      return
    }
    handleChange(path, hasTime ? toISODateTime(nextDate, nextTime || '00:00') : nextDate)
  }

  return shell(
    <Flex gap="2" align="center">
      <TextField.Root
        type="date"
        value={datePart}
        disabled={!enabled}
        color={!isValid ? 'red' : undefined}
        onChange={(e) => commit(e.target.value, timeForInput)}
        id={path}
        style={{ flex: 1 }}
      >
        {locked && <ReadOnlyLock />}
      </TextField.Root>
      {hasTime && (
        <TextField.Root
          type="time"
          step={timeStep}
          value={timeForInput}
          disabled={!enabled || !datePart}
          color={!isValid ? 'red' : undefined}
          onChange={(e) => commit(datePart, e.target.value)}
          style={{ flex: 1 }}
        />
      )}
    </Flex>,
  )
}

export const DateControlTester: RankedTester = rankWith(2, or(isDateControl, isDateTimeControl, isTimeControl))

const JsonFormsDateControl = withJsonFormsControlProps(DateControl)
export default JsonFormsDateControl
