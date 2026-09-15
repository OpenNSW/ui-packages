import {
  type Layout,
  type ControlElement,
  type UISchemaElement,
  type JsonSchema,
  type OwnPropsOfLayout,
  type CoreActions,
  Resolve,
  Paths,
  composePaths,
  update,
} from '@jsonforms/core'
import { ctxToLayoutProps, withJsonFormsContext, JsonFormsDispatch, type JsonFormsStateContext } from '@jsonforms/react'
import { Box, Flex, Heading, Text } from '@radix-ui/themes'
import { MagicWandIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useRef, type ComponentType, type Dispatch } from 'react'
import type { SearchOption } from '../contexts/SearchServiceContext'
import { readByPath } from '../utils/objectPath'

interface FillEntry {
  // where to write, relative to this group's own path — or an absolute form path when `absolute: true`
  path: string
  // dot-path into the trigger's selected payload; '' means "the whole payload"
  from: string
  absolute?: boolean
}

interface AutoFillOptions {
  // relative dot-path (from this group's own path) to the trigger Control declared in `elements`
  trigger: string
  // explicit overrides — for response keys that don't match a sibling's own path, reshaping, or wholesale drops.
  // everything else is auto-matched: a descendant Control whose own relative path matches a key in the payload,
  // and whose schema type is compatible with that value, is filled automatically.
  fill?: FillEntry[]
}

type AutoFillGroupLayout = Layout & {
  label?: string
  options?: { autoFill?: AutoFillOptions }
}

interface AutoFillGroupProps extends OwnPropsOfLayout {
  uischema: AutoFillGroupLayout
  schema: JsonSchema
  path: string
  data?: unknown
  dispatch: Dispatch<CoreActions>
}

interface TriggerValue {
  value?: string
  label?: string
  payload?: SearchOption
}

// container element types this walks into to find fillable Control leaves — a nested AutoFillGroup
// is its own independent trigger/fill boundary and is deliberately left opaque, not recursed into
const CONTAINER_TYPES = new Set(['VerticalLayout', 'HorizontalLayout', 'Group', 'Categorization', 'Category'])

function collectControlElements(elements: UISchemaElement[], acc: ControlElement[] = []): ControlElement[] {
  for (const el of elements) {
    if (el.type === 'Control' && (el as ControlElement).scope) {
      acc.push(el as ControlElement)
    } else if (CONTAINER_TYPES.has(el.type) && 'elements' in el) {
      collectControlElements((el as Layout).elements, acc)
    }
  }
  return acc
}

function isTypeCompatible(schemaType: string | string[] | undefined, value: unknown): boolean {
  if (!schemaType) return true // unknown schema type — don't block; AJV will catch a real mismatch on submit
  const types = Array.isArray(schemaType) ? schemaType : [schemaType]
  return types.some((t) => {
    switch (t) {
      case 'string':
        return typeof value === 'string'
      case 'number':
      case 'integer':
        return typeof value === 'number'
      case 'boolean':
        return typeof value === 'boolean'
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'array':
        return Array.isArray(value)
      case 'null':
        return value === null
      default:
        return true
    }
  })
}

const AutoFillGroupControl = ({ uischema, schema, path, data, dispatch, renderers, cells, enabled, visible = true }: AutoFillGroupProps) => {
  const layout = uischema
  const elements = layout.elements
  const autoFill = layout.options?.autoFill

  const triggerValue = autoFill ? (Resolve.data(data, autoFill.trigger) as TriggerValue | undefined) : undefined
  const payload = triggerValue?.payload

  const autoTargets = useMemo(() => {
    if (!autoFill) return []
    return collectControlElements(elements)
      .map((control) => ({ control, relativePath: Paths.fromScoped(control) }))
      .filter(({ relativePath }) => relativePath !== autoFill.trigger)
  }, [elements, autoFill?.trigger])

  const lastPayloadRef = useRef<unknown>(undefined)

  useEffect(() => {
    if (!autoFill) return
    if (payload === lastPayloadRef.current) return
    lastPayloadRef.current = payload

    const explicit = autoFill.fill ?? []
    const explicitRelPaths = new Set(explicit.map((f) => f.path))

    if (!payload) {
      // trigger cleared — clear whatever this group previously filled
      autoTargets
        .filter(({ relativePath }) => !explicitRelPaths.has(relativePath))
        .forEach(({ relativePath }) => dispatch(update(composePaths(path, relativePath), () => undefined)))
      explicit.forEach((entry) => {
        const targetPath = entry.absolute ? entry.path : composePaths(path, entry.path)
        dispatch(update(targetPath, () => undefined))
      })
      return
    }

    explicit.forEach((entry) => {
      const { found, value } = readByPath(payload, entry.from)
      if (!found) {
        console.warn(`[AutoFillGroup] "${entry.from}" not found in the trigger's payload for fill target "${entry.path}"`)
        return
      }
      const targetPath = entry.absolute ? entry.path : composePaths(path, entry.path)
      dispatch(update(targetPath, () => value))
    })

    autoTargets.forEach(({ control, relativePath }) => {
      if (explicitRelPaths.has(relativePath)) return // explicit fill wins
      const { found, value } = readByPath(payload, relativePath)
      if (!found) return // not every sibling needs to come from this payload

      const targetSchema = Resolve.schema(schema, control.scope, schema)
      if (!isTypeCompatible(targetSchema?.type as string | string[] | undefined, value)) {
        console.warn(
          `[AutoFillGroup] payload field "${relativePath}" (${typeof value}) does not match schema type "${targetSchema?.type}" — skipped`,
        )
        return
      }
      dispatch(update(composePaths(path, relativePath), () => value))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the trigger's resolved payload changes
  }, [payload])

  if (visible === false) return null

  if (!autoFill) {
    return (
      <Box mb="6">
        <Text size="2" color="red">
          AutoFillGroup requires an `options.autoFill.trigger` configuration.
        </Text>
      </Box>
    )
  }

  return (
    <Box mb="6" p="4" style={{ borderLeft: '3px solid var(--accent-9)', background: 'var(--accent-2)', borderRadius: 'var(--radius-3)' }}>
      {layout.label && (
        <Flex align="center" gap="2" mb="3">
          <MagicWandIcon />
          <Heading size="3" className="text-gray-500 uppercase tracking-wide font-semibold">
            {layout.label}
          </Heading>
        </Flex>
      )}
      <Flex direction="column" gap="4">
        {elements.map((element, index) => (
          <JsonFormsDispatch
            key={`${path}-${index}`}
            uischema={element}
            schema={schema}
            path={path}
            renderers={renderers}
            cells={cells}
            enabled={enabled}
          />
        ))}
      </Flex>
    </Box>
  )
}

const withAutoFillGroupContext = (Component: typeof AutoFillGroupControl): ComponentType<OwnPropsOfLayout> =>
  // bypasses the plain layout wiring — we additionally need raw `dispatch` to write to sibling paths,
  // not just the group's own path, the same way DependentSelectControl reaches into ctx for cross-field reads
  withJsonFormsContext(function AutoFillGroupWithContext({
    ctx,
    props: ownProps,
  }: {
    ctx: JsonFormsStateContext
    props: OwnPropsOfLayout
  }) {
    const layoutProps = ctxToLayoutProps(ctx, ownProps)
    // dispatch is always set once JsonForms has initialized — this control never renders before that
    return <Component {...(layoutProps as unknown as AutoFillGroupProps)} dispatch={ctx.dispatch!} />
  })

const AutoFillGroupRenderer = withAutoFillGroupContext(AutoFillGroupControl)

export default AutoFillGroupRenderer