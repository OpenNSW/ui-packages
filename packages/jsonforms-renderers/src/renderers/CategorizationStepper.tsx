import { type Categorization, type Category, type JsonSchema, isVisible } from '@jsonforms/core'
import { JsonFormsDispatch, useJsonForms } from '@jsonforms/react'
import type { JsonFormsCellRendererRegistryEntry, JsonFormsRendererRegistryEntry } from '@jsonforms/core'
import { Box, Button, Callout, Flex, Heading, Progress, Text } from '@radix-ui/themes'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { type CSSProperties, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useFormSteps } from '../contexts/formSteps'
import {
  type StepError,
  type StepProblem,
  categoriesOf,
  emptyRequiredPaths,
  hasAnswers,
  stepProblems,
  stepSummary,
  visibleControls,
} from '../utils/steps'

const REVIEW_LABEL = 'Review and Submit'

// How far below the top of the viewport the step list sticks, and where a new
// step scrolls to: set --form-steps-offset to clear a fixed app header.
const OFFSET = 'var(--form-steps-offset, 16px)'

interface Props {
  uischema: Categorization
  schema: JsonSchema
  path: string
  renderers?: JsonFormsRendererRegistryEntry[]
  cells?: JsonFormsCellRendererRegistryEntry[]
  enabled: boolean
}

/**
 * A Categorization shown one Category at a time: a step list at the side
 * ("Step 2 of 5" on narrow screens), Back/Continue at the bottom, and a final
 * read-only "Review and Submit" step.
 *
 * Continue checks only the step on screen, and lists what is still missing
 * there instead of moving on. Every step stays mounted and the others are
 * hidden, not unmounted: controls that write from effects (computed fields,
 * spreadsheet sources, clearing a field its rule hides) keep working while
 * their step is off screen, as they do on a single-page form.
 *
 * The buttons that submit the form belong to the host, which learns the step
 * through FormStepsProvider and offers them on the last step only.
 *
 * A read-only stepper has nothing to step through, so it shows every step on
 * one page under its heading instead (see CategorizationSections).
 */
export const CategorizationStepper = (props: Props) =>
  props.enabled ? <EditableStepper {...props} /> : <CategorizationSections {...props} />

const EditableStepper = ({ uischema, schema, path, renderers, cells, enabled }: Props) => {
  const ctx = useJsonForms()
  const core = ctx.core
  const host = useFormSteps()
  const rootSchema: JsonSchema = core?.schema ?? schema
  const data: unknown = core?.data
  const ajv = core?.ajv
  const config: unknown = ctx.config
  const categories = useVisibleCategories(uischema, path)
  const count = categories.length
  // The review step comes after the last Category.
  const lastStep = count

  const errors = useMemo(
    () => [...(core?.errors ?? []), ...(core?.additionalErrors ?? [])] as StepError[],
    [core?.errors, core?.additionalErrors],
  )
  const emptyPaths = useMemo(() => emptyRequiredPaths(rootSchema, data), [rootSchema, data])
  const problems: StepProblem[][] = useMemo(
    () =>
      categories.map((c) =>
        stepProblems(visibleControls(c, data, ajv, config, path), errors, emptyPaths, rootSchema, path),
      ),
    // categories is rebuilt every render; its content follows uischema, data and rules.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uischema, path, data, ajv, config, errors, emptyPaths, rootSchema],
  )

  const [current, setCurrent] = useState(0)
  // The furthest step the step list can go to: any step up to it, but not
  // ahead of a step never checked. A form opened with saved answers (a draft)
  // starts with its answered, complete steps open, up to the first that isn't.
  const [reached, setReached] = useState(() => {
    const open = (c: Category, i: number) =>
      problems[i].length === 0 && hasAnswers(visibleControls(c, data, ajv, config, path), data, path)
    const first = categories.findIndex((c, i) => !open(c, i))
    return first === -1 ? lastStep : first
  })
  // Steps where Continue was refused, so their summary shows.
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(new Set())
  // A rule can hide a step after the trader has moved past it.
  const step = Math.min(current, lastStep)
  const onReview = step === lastStep

  const notifyHost = useEffectEvent(() => host?.onStepChange?.({ step, count, last: step === lastStep }))
  useEffect(() => {
    notifyHost()
  }, [step, count, lastStep])

  // Bring a newly chosen step into view and move focus to its title, so a
  // screen reader announces it. Compared with the step last shown rather than
  // skipping the first run, which StrictMode repeats.
  const top = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step)
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    top.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    title.current?.focus({ preventScroll: true })
  }, [step])

  if (!count) return null

  const goTo = (index: number) => {
    if (index > reached && index !== step) return
    setCurrent(index)
  }

  const next = () => {
    if (problems[step]?.length) {
      setAttempted((prev) => new Set(prev).add(step))
      host?.onInvalidStep?.()
      return
    }
    const to = Math.min(step + 1, lastStep)
    setCurrent(to)
    setReached((r) => Math.max(r, to))
  }

  const labels = [...categories.map((c) => c.label), REVIEW_LABEL]
  const totalSteps = labels.length
  const stepStatus = (index: number): StepStatus => {
    if (index === step) return 'current'
    if (index < count && problems[index]?.length && (attempted.has(index) || index < reached)) return 'error'
    if (index < reached || (index < count && index < step)) return 'done'
    return 'todo'
  }
  // What is left to fix on a step: once Continue was refused there, or once
  // the trader has moved past it and come back to change it.
  const toFix = (index: number, status: StepStatus): number =>
    status === 'error' || (status === 'current' && attempted.has(index)) ? (problems[index]?.length ?? 0) : 0
  const stepNote = (index: number, status: StepStatus): string => {
    if (index === lastStep) return 'Check and submit'
    if (toFix(index, status) > 0) return `${toFix(index, status)} to fix`
    if (status === 'done') return 'Done'
    return stepSummary(visibleControls(categories[index], data, ajv, config, path), data, rootSchema, path)
  }
  const description = onReview ? undefined : (categories[step]?.options?.description as string | undefined)
  // On the review step: each step still incomplete, linking back to it.
  const incomplete = categories
    .map((category, index) => ({ category, index, p: problems[index] }))
    .filter(({ p }) => p.length)
    .map(({ category, index, p }) => ({
      key: String(index),
      label: `${category.label}: ${p.map((x) => x.label).join(', ')}`,
      onClick: () => {
        setAttempted((prev) => new Set(prev).add(index))
        goTo(index)
      },
    }))

  return (
    <Flex ref={top} gap="5" align="start" style={{ scrollMarginTop: OFFSET }}>
      <Box
        asChild
        display={{ initial: 'none', sm: 'block' }}
        p="4"
        style={{
          ...panelStyle,
          flex: '0 0 248px',
          position: 'sticky',
          top: OFFSET,
          maxHeight: `calc(100vh - 2 * ${OFFSET})`,
          overflowY: 'auto',
        }}
      >
        <nav aria-label="Form steps">
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {labels.map((label, index) => {
              const status = stepStatus(index)
              return (
                <li key={`${path}-step-${index}`} style={{ position: 'relative' }}>
                  {index < totalSteps - 1 && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 21,
                        top: 40,
                        bottom: -4,
                        width: 2,
                        borderRadius: 1,
                        background: status === 'done' ? 'var(--green-9)' : 'var(--gray-a5)',
                      }}
                    />
                  )}
                  <StepLink
                    index={index}
                    label={label}
                    note={stepNote(index, status)}
                    errorCount={toFix(index, status)}
                    status={status}
                    disabled={index > reached}
                    onSelect={() => goTo(index)}
                  />
                </li>
              )
            })}
          </ol>
        </nav>
      </Box>

      <Box style={{ ...panelStyle, flex: 1, minWidth: 0 }}>
        <Box px={{ initial: '4', sm: '6' }} pt={{ initial: '4', sm: '5' }} pb="4">
          <Text
            as="p"
            size="1"
            weight="bold"
            color="gray"
            style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            Step {step + 1} of {totalSteps}
          </Text>
          <Heading ref={title} tabIndex={-1} size="5" as="h2" mt="1" style={{ outline: 'none' }}>
            {labels[step]}
          </Heading>
          {description && (
            <Text as="p" size="2" color="gray" mt="1">
              {description}
            </Text>
          )}
          <Progress value={((step + 1) / totalSteps) * 100} size="1" mt="4" aria-label="Progress through the form" />
        </Box>

        <Box px={{ initial: '4', sm: '6' }} pb="5" data-form-review={onReview ? '' : undefined}>
          {onReview &&
            (incomplete.length ? (
              <ProblemCallout title="Some steps are not complete yet:" items={incomplete} />
            ) : (
              <Text as="p" size="2" color="gray" mb="5">
                Check your answers below, then submit.
              </Text>
            ))}

          {categories.map((category, index) => {
            const shown = onReview || index === step
            return (
              <Box key={`${path}-${index}`} hidden={!shown} mb={onReview ? '6' : undefined}>
                {onReview && (
                  <Flex
                    justify="between"
                    align="center"
                    mb="3"
                    pb="2"
                    style={{ borderBottom: '1px solid var(--gray-a4)' }}
                  >
                    <Heading size="3" as="h3">
                      {category.label}
                    </Heading>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => goTo(index)}
                      aria-label={`Edit ${category.label}`}
                    >
                      Edit
                    </Button>
                  </Flex>
                )}
                {!onReview && attempted.has(index) && problems[index].length > 0 && (
                  <ProblemCallout
                    title="Complete these fields to continue:"
                    items={problems[index].map((p) => ({
                      key: p.path,
                      label: p.label,
                      onClick: () => focusField(p.path),
                    }))}
                  />
                )}
                <CategoryFields
                  category={category}
                  schema={schema}
                  path={path}
                  renderers={renderers}
                  cells={cells}
                  enabled={enabled && !onReview}
                />
              </Box>
            )
          })}
        </Box>

        <Flex
          gap="3"
          align="center"
          wrap="wrap"
          px={{ initial: '4', sm: '6' }}
          py="4"
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 1,
            borderTop: '1px solid var(--gray-a5)',
            background: 'var(--color-panel-solid)',
            borderRadius: '0 0 var(--radius-5) var(--radius-5)',
          }}
        >
          {step > 0 && (
            <Button type="button" variant="ghost" color="gray" size="3" onClick={() => setCurrent(step - 1)}>
              <ChevronLeftIcon />
              Back
            </Button>
          )}
          <Box flexGrow="1" />
          {host?.actions}
          {step < lastStep && (
            <Button type="button" size="3" onClick={next}>
              Continue
              <ChevronRightIcon />
            </Button>
          )}
        </Flex>
      </Box>
    </Flex>
  )
}

type StepStatus = 'current' | 'error' | 'done' | 'todo'

/** The card both columns sit in. Not Radix's Card: its overflow clipping would stop the footer sticking. */
const panelStyle = {
  background: 'var(--color-panel-solid)',
  border: '1px solid var(--gray-a4)',
  borderRadius: 'var(--radius-5)',
  boxShadow: 'var(--shadow-2)',
} as const

function StepLink({
  index,
  label,
  note,
  errorCount,
  status,
  disabled,
  onSelect,
}: {
  index: number
  label: string
  note: string
  errorCount: number
  status: StepStatus
  disabled: boolean
  onSelect: () => void
}) {
  const circle: Record<StepStatus, CSSProperties> = {
    done: { background: 'var(--green-9)', color: 'white' },
    current: {
      background: 'var(--color-panel-solid)',
      color: 'var(--accent-11)',
      boxShadow: 'inset 0 0 0 2px var(--accent-9)',
    },
    error: { background: 'var(--red-9)', color: 'white' },
    todo: {
      background: 'var(--color-panel-solid)',
      color: 'var(--gray-11)',
      boxShadow: 'inset 0 0 0 2px var(--gray-a6)',
    },
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-current={status === 'current' ? 'step' : undefined}
      className="w-full rounded-md disabled:cursor-default enabled:hover:bg-[var(--gray-a2)]"
      style={{ border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: '8px 8px 12px' }}
    >
      <Flex gap="3" align="start">
        <Flex
          align="center"
          justify="center"
          aria-hidden
          style={{
            width: 28,
            height: 28,
            flex: '0 0 28px',
            borderRadius: '50%',
            fontSize: 13,
            fontWeight: 600,
            ...circle[status],
          }}
        >
          {status === 'done' ? <CheckIcon width={16} height={16} /> : index + 1}
        </Flex>
        <Box style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
          <Flex align="center" gap="2" justify="between">
            <Text
              size="2"
              weight={status === 'current' ? 'bold' : 'medium'}
              style={{ color: status === 'current' ? 'var(--accent-11)' : 'var(--gray-12)' }}
            >
              {label}
            </Text>
            {errorCount > 0 && (
              <Flex
                align="center"
                justify="center"
                aria-hidden
                data-testid="step-error-count"
                style={{
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  boxSizing: 'border-box',
                  borderRadius: 10,
                  background: 'var(--red-9)',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                {errorCount}
              </Flex>
            )}
          </Flex>
          <Text as="p" size="1" color={errorCount > 0 ? 'red' : 'gray'}>
            {note}
          </Text>
        </Box>
      </Flex>
    </button>
  )
}

/** Focuses a control by the input id the controls give it (their data path). */
function focusField(path: string) {
  const el = document.getElementById(path)
  el?.scrollIntoView?.({ block: 'center' })
  el?.focus()
}

function ProblemCallout({
  title,
  items,
}: {
  title: string
  items: { key: string; label: string; onClick: () => void }[]
}) {
  return (
    <Callout.Root color="red" mb="4" role="alert">
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Callout.Text>{title}</Callout.Text>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item) => (
          <li key={item.key}>
            <Button type="button" variant="ghost" color="red" size="1" onClick={item.onClick}>
              {item.label}
            </Button>
          </li>
        ))}
      </ul>
    </Callout.Root>
  )
}

/**
 * Every visible Category one after another, each under its heading: a
 * read-only stepper. Like the review step, it carries `data-form-review`, so
 * a host can show its read-only values as plain answers rather than as
 * disabled inputs.
 */
const CategorizationSections = ({ uischema, schema, path, renderers, cells }: Props) => {
  const host = useFormSteps()
  const categories = useVisibleCategories(uischema, path)
  const count = categories.length

  const notifyHost = useEffectEvent(() => host?.onStepChange?.({ step: count, count, last: true }))
  useEffect(() => {
    notifyHost()
  }, [count])

  return (
    <Flex direction="column" gap="6" p={{ initial: '4', sm: '6' }} style={panelStyle} data-form-review="">
      {categories.map((category, index) => (
        <Box key={`${path}-${index}`}>
          <Heading size="3" as="h3" mb="3">
            {category.label}
          </Heading>
          <CategoryFields
            category={category}
            schema={schema}
            path={path}
            renderers={renderers}
            cells={cells}
            enabled={false}
          />
        </Box>
      ))}
    </Flex>
  )
}

/** The Categories whose rules currently show them. */
function useVisibleCategories(uischema: Categorization, path: string): Category[] {
  const ctx = useJsonForms()
  const ajv = ctx.core?.ajv
  const data: unknown = ctx.core?.data
  const config: unknown = ctx.config
  return categoriesOf(uischema).filter((c) => !c.rule || !ajv || isVisible(c, data, path, ajv, config))
}

function CategoryFields({
  category,
  schema,
  path,
  renderers,
  cells,
  enabled,
}: Omit<Props, 'uischema'> & { category: Category }) {
  return (
    <Flex direction="column" gap="4">
      {category.elements.map((element, index) => (
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
  )
}
