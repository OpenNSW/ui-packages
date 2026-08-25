import { type ControlProps, type JsonSchema, type OwnPropsOfControl, Resolve } from '@jsonforms/core'
import {
  ctxDispatchToControlProps,
  ctxToControlProps,
  withJsonFormsContext,
  type JsonFormsStateContext,
} from '@jsonforms/react'
import { Select, Text, Flex, Box } from '@radix-ui/themes'
import { useEffect, type ComponentType } from 'react'
import { useClearWhenHidden } from '../hooks/useClearWhenHidden'
import { getErrorMessage } from '../utils/error'

type DependentSelectProps = ControlProps & {
  schema: JsonSchema & { 'x-depends-on'?: string }
  // the whole form's live data — needed to look up a sibling field's current value; not part of stock ControlProps
  rootData: unknown
}

export const DependentSelectControl = ({
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
  rootData,
}: DependentSelectProps) => {
  useClearWhenHidden(visible, path, handleChange)

  const dependsOn = schema['x-depends-on']
  // resolved relative to the same object (array item or otherwise) the control itself lives in
  const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : ''
  const siblingPath = dependsOn ? (parentPath ? `${parentPath}.${dependsOn}` : dependsOn) : undefined
  const siblingValue = siblingPath ? (Resolve.data(rootData, siblingPath) as string | undefined) : undefined

  // stable per-option UI token — distinguishes const values that collide under String() (1 vs "1", true vs "true")
  const constToken = (value: unknown) => `${typeof value}:${String(value)}`

  const options = (schema.oneOf ?? [])
    .filter((o) => siblingValue !== undefined && (o as Record<string, unknown>)['x-group'] === siblingValue)
    .map((o) => ({ token: constToken(o.const), const: o.const, label: o.title || String(o.const) }))

  useEffect(() => {
    // sibling changed (or was cleared) and the previously-selected option is no longer in the filtered list
    if (data !== undefined && !options.some((o) => o.const === data)) {
      handleChange(path, undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when the sibling value changes
  }, [siblingValue])

  if (visible === false) {
    return null
  }

  const isValid = errors.length === 0
  const value = data !== undefined ? constToken(data) : ''
  const isDisabled = !enabled || siblingValue === undefined

  return (
    <Box mb="4">
      <Flex direction="column" gap="1">
        <Text as="label" size="2" weight="bold" htmlFor={path}>
          {label} {required && <Text color="red">*</Text>}
        </Text>
        <Select.Root
          value={value}
          onValueChange={(token) => handleChange(path, options.find((o) => o.token === token)?.const)}
          disabled={isDisabled}
        >
          <Select.Trigger
            placeholder={
              siblingValue === undefined
                ? 'Select a value above first'
                : uischema.options?.placeholder || 'Select an option'
            }
            color={!isValid ? 'red' : undefined}
            id={path}
          />
          <Select.Content>
            {options.map((opt) => (
              <Select.Item key={opt.token} value={opt.token}>
                {opt.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
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

// bypasses withJsonFormsControlProps, which narrows to this control's own data — we additionally need
// the whole form's data (via ctx.core.data) to resolve a sibling field's current value
const withDependentSelectProps = (Component: typeof DependentSelectControl): ComponentType<OwnPropsOfControl> =>
  // withJsonFormsContext calls the wrapped component with { ctx, props: ownProps } — own props are
  // nested under `props`, not spread onto the outer object
  withJsonFormsContext(function DependentSelectWithContext({
    ctx,
    props: ownProps,
  }: {
    ctx: JsonFormsStateContext
    props: OwnPropsOfControl
  }) {
    const controlProps = ctxToControlProps(ctx, ownProps)
    // dispatch is always set once JsonForms has initialized — this control never renders before that
    const dispatchProps = ctxDispatchToControlProps(ctx.dispatch!)
    return <Component {...ownProps} {...controlProps} {...dispatchProps} rootData={ctx.core?.data} />
  })

const DependentSelectRenderer = withDependentSelectProps(DependentSelectControl)

export default DependentSelectRenderer
