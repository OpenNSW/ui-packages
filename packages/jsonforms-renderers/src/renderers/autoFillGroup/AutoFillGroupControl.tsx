import {
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
import { useEffect, useMemo, useRef, type ComponentType, type Dispatch } from 'react'
import {
  collectControlElements,
  computeAutoFillUpdates,
  computeClearUpdates,
  type AutoFillGroupLayout,
} from './fillLogic'
import { AutoFillSourceProvider, createAutoFillSourceStore, useAutoFillSourceValue } from './AutoFillSourceContext'

interface AutoFillGroupProps extends OwnPropsOfLayout {
  uischema: AutoFillGroupLayout
  schema: JsonSchema
  path: string
  data?: unknown
  dispatch: Dispatch<CoreActions>
}

const AutoFillGroupControl = ({
  uischema,
  schema,
  path,
  data,
  dispatch,
  renderers,
  cells,
  enabled,
  visible = true,
}: AutoFillGroupProps) => {
  const layout = uischema
  const elements = layout.elements
  const autoFill = layout.options?.autoFill

  // the store is provided to descendants below — a source control (e.g. SearchSelectControl) can
  // publish a richer value here than what it writes to form data, without that value ever becoming
  // part of the form's persisted/validated data
  const store = useMemo(() => createAutoFillSourceStore(), [])
  const absoluteSourcePath = autoFill ? composePaths(path, autoFill.source) : ''
  const publishedSourceValue = useAutoFillSourceValue(store, absoluteSourcePath)
  const dataSourceValue: unknown = autoFill ? Resolve.data(data, autoFill.source) : undefined
  // prefer what the source control published (richer than its own form value); fall back to
  // its plain form value for a source that never publishes anything (its own value already
  // matches this group's schema, so there's nothing extra to fetch)
  const sourceValue: unknown = publishedSourceValue !== undefined ? publishedSourceValue : dataSourceValue

  const autoTargets = useMemo(() => {
    if (!autoFill) return []
    return collectControlElements(elements)
      .map((control) => ({ control, relativePath: Paths.fromScoped(control) }))
      .filter(({ relativePath }) => relativePath !== autoFill.source)
  }, [elements, autoFill])

  const lastSourceRef = useRef<unknown>(undefined)
  // relative target path -> value this component last wrote there, so a clear can tell a field it filled
  // (safe to blank) apart from one the user has since hand-edited (leave alone). Only covers relative
  // writes — an absolute `fill` entry can land outside this group's own data, which this component can't
  // read back to compare, so those are always cleared unconditionally, as before.
  const filledRef = useRef<Map<string, unknown>>(new Map())

  useEffect(() => {
    if (!autoFill) return
    if (sourceValue === lastSourceRef.current) return
    lastSourceRef.current = sourceValue

    if (!sourceValue) {
      // source cleared — blank out whatever this group actually filled last time, unless the user
      // has since changed that field themselves
      computeClearUpdates(filledRef.current, data).forEach((relativePath) =>
        dispatch(update(composePaths(path, relativePath), () => undefined)),
      )
      filledRef.current = new Map()
      ;(autoFill.fill ?? [])
        .filter((entry) => entry.absolute)
        .forEach((entry) => dispatch(update(entry.path, () => undefined)))
      return
    }

    const nextFilled = new Map<string, unknown>()
    computeAutoFillUpdates(autoFill, autoTargets, schema, sourceValue).forEach((fillUpdate) => {
      const targetPath = fillUpdate.absolute ? fillUpdate.path : composePaths(path, fillUpdate.path)
      dispatch(update(targetPath, () => fillUpdate.value))
      if (!fillUpdate.absolute) nextFilled.set(fillUpdate.path, fillUpdate.value)
    })
    filledRef.current = nextFilled
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the source's resolved value changes
  }, [sourceValue])

  if (visible === false) return null

  if (!autoFill) {
    return (
      <Box mb="6">
        <Text size="2" color="red">
          AutoFillGroup requires an `options.autoFill.source` configuration.
        </Text>
      </Box>
    )
  }

  return (
    <Box mb="6">
      {layout.label && (
        <Heading size="3" mb="3" className="text-gray-500 uppercase tracking-wide font-semibold">
          {layout.label}
        </Heading>
      )}
      <AutoFillSourceProvider store={store}>
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
      </AutoFillSourceProvider>
    </Box>
  )
}

const withAutoFillGroupContext = (Component: typeof AutoFillGroupControl): ComponentType<OwnPropsOfLayout> =>
  // bypasses the plain layout wiring — we additionally need raw `dispatch` to write to sibling paths, not just the group's own path
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
