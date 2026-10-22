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
import dayjs from 'dayjs'

import { useIsRequired } from '../hooks/useIsRequired'
import { getErrorMessage } from '../utils/error'
import { useReadOnlyMark } from '../contexts/formReview'
import { ReadOnlyLock } from './ReadOnlyLock'
import { timeInputValue, toRfc3339Time } from '../utils/time'

// dayjs().format() defaults to RFC 3339 (e.g. 2026-06-05T12:30:00+05:30) with
// seconds + local offset, which ajv's strict "date-time" format check requires.
const toISODateTime = (dateStr: string, timeStr: string) => dayjs(`${dateStr}T${timeStr}`).format()

/** The current local calendar day, used as the picker's minimum. */
export function localISODate(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
  // minDate "today" means the current day: the picker cannot offer an earlier one.
  const earliestDate = uischema?.options?.minDate === 'today' && schema.format !== 'time' ? localISODate() : undefined

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
    if (earliestDate && nextDate < earliestDate) {
      // Re-apply the stored day so a typed past date snaps back.
      handleChange(path, datePart ? (hasTime ? toISODateTime(datePart, nextTime || '00:00') : datePart) : undefined)
      return
    }
    handleChange(path, hasTime ? toISODateTime(nextDate, nextTime || '00:00') : nextDate)
  }

  return shell(
    <Flex gap="2" align="center">
      <TextField.Root
        type="date"
        value={datePart}
        min={earliestDate}
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
