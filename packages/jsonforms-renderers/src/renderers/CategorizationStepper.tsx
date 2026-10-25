import {
  type Categorization,
  type Category,
  type JsonSchema,
  type Translator,
  defaultTranslator,
  deriveLabelForUISchemaElement,
  getI18nKeyPrefixBySchema,
  isVisible,
} from '@jsonforms/core'
import { JsonFormsDispatch, useJsonForms } from '@jsonforms/react'
import type { JsonFormsCellRendererRegistryEntry, JsonFormsRendererRegistryEntry } from '@jsonforms/core'
import { Box, Button, Callout, Flex, Heading, Progress, Select, Text } from '@radix-ui/themes'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { type CSSProperties, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import { useFormSteps } from '../contexts/formSteps'
import { FormReviewContext } from '../contexts/formReview'
import {
  type FormError,
  type StepProblem,
  categoriesOf,
  hasAnswers,
  stepProblems,
  stepSummary,
  visibleControls,
} from '../utils/steps'
import { type StepperMessage, stepperText } from '../utils/stepperText'

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
 * one page under its heading instead, with the step list as a contents list
 * that jumps to each (see CategorizationSections).
 */
export const CategorizationStepper = (props: Props) =>
  props.enabled ? <EditableStepper {...props} /> : <CategorizationSections {...props} />

/** The stepper a trader fills in: step list, current step, footer. */
const EditableStepper = ({ uischema, schema, path, renderers, cells, enabled }: Props) => {
  const ctx = useJsonForms()
  const core = ctx.core
  const host = useFormSteps()
  const rootSchema: JsonSchema = core?.schema ?? schema
  const data: unknown = core?.data
  const ajv = core?.ajv
  const config: unknown = ctx.config
  const translate = ctx.i18n?.translate
  const t = (key: StepperMessage, values?: Record<string, string | number>) => stepperText(translate, key, values)
  const categories = useVisibleCategories(uischema, path)
  const count = categories.length
  // The review step comes after the last Category.
  const lastStep = count

  // The form's own errors, whatever the validation mode shows: JSON Forms'
  // and any the host added. The stepper adds no checks of its own.
  const errors = useMemo<FormError[]>(
    () => [...(core?.errors ?? []), ...(core?.additionalErrors ?? [])],
    [core?.errors, core?.additionalErrors],
  )
  const problems: StepProblem[][] = useMemo(
    () =>
      stepProblems(
        categories.map((c) => visibleControls(c, data, ajv, config, path)),
        errors,
        rootSchema,
        path,
        translate,
      ),
    // categories is rebuilt every render; its content follows uischema, data and rules.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uischema, path, data, ajv, config, errors, rootSchema, translate],
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

  // On a step change, move focus to the new step's title, so a screen reader
  // announces it, and scroll the stepper's top back into view only when it is
  // above its scroll offset (as after Continue at the bottom of a long step):
  // choosing a step while the top is on screen leaves the page where it is.
  // Compared with the step last shown rather than skipping the first run,
  // which StrictMode repeats.
  const top = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step)
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    const el = top.current
    const offset = el ? parseFloat(getComputedStyle(el).scrollMarginTop) || 0 : 0
    if (el && el.getBoundingClientRect().top < offset) {
      el.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    }
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

  const labels = [...categories.map((c) => categoryLabel(c, translate)), t('review')]
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
    if (index === lastStep) return t('noteReview')
    if (toFix(index, status) > 0) return t('noteToFix', { count: toFix(index, status) })
    if (status === 'done') return t('noteDone')
    const summary = stepSummary(visibleControls(categories[index], data, ajv, config, path), data, path)
    const one = summary.count === 1
    if (summary.kind === 'items') return t(one ? 'noteItem' : 'noteItems', { count: summary.count })
    return t(one ? 'noteField' : 'noteFields', { count: summary.count })
  }
  const description = onReview ? undefined : categoryDescription(categories[step], translate)
  // On the review step: each step still incomplete, linking back to it.
  const incomplete = problems
    .map((p, index) => ({ index, p }))
    .filter(({ p }) => p.length)
    .map(({ index, p }) => ({
      key: String(index),
      label: `${labels[index]}: ${p.map((x) => x.label).join(', ')}`,
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
        <nav aria-label={t('navLabel')}>
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
            {t('stepOf', { step: step + 1, total: totalSteps })}
          </Text>
          <Heading ref={title} tabIndex={-1} size="5" as="h2" mt="1" style={{ outline: 'none' }}>
            {labels[step]}
          </Heading>
          {description && (
            <Text as="p" size="2" color="gray" mt="1">
              {description}
            </Text>
          )}
          <Progress value={((step + 1) / totalSteps) * 100} size="1" mt="4" aria-label={t('progressLabel')} />
        </Box>

        <Box px={{ initial: '4', sm: '6' }} pb="5" data-form-review={onReview ? '' : undefined}>
          <FormReviewContext.Provider value={onReview}>
            {onReview &&
              (incomplete.length ? (
                <ProblemCallout title={t('incompleteSteps')} items={incomplete} />
              ) : (
                <Text as="p" size="2" color="gray" mb="5">
                  {t('reviewHint')}
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
                        {labels[index]}
                      </Heading>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => goTo(index)}
                        aria-label={t('editStep', { step: labels[index] })}
                      >
                        {t('edit')}
                      </Button>
                    </Flex>
                  )}
                  {!onReview && attempted.has(index) && problems[index].length > 0 && (
                    <ProblemCallout
                      title={t('missingFields')}
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
          </FormReviewContext.Provider>
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
              {t('back')}
            </Button>
          )}
          <Box flexGrow="1" />
          {host?.actions}
          {step < lastStep && (
            <Button type="button" size="3" onClick={next}>
              {t('continue')}
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

/** One step in the step list: its number or tick, label, note and error count. */
function StepLink({
  index,
  label,
  note,
  errorCount,
  status,
  disabled = false,
  current = 'step',
  onSelect,
}: {
  index: number
  label: string
  note?: string
  errorCount?: number
  status: StepStatus
  disabled?: boolean
  /** What the current entry is to a screen reader: the step, or the place on the page. */
  current?: 'step' | 'location'
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
      aria-current={status === 'current' ? current : undefined}
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
            {errorCount != null && errorCount > 0 && (
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
          {note && (
            <Text as="p" size="1" color={errorCount ? 'red' : 'gray'}>
              {note}
            </Text>
          )}
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

/** A red summary of what is missing, each item a link that goes to it. */
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
 *
 * With more than one section, the step list sits at the side as a contents
 * list ("Jump to section" on narrow screens): choosing an entry scrolls to it,
 * and the entry for the section being read is marked as the page scrolls. The
 * host can end the list with links of its own (`contentsLinks`).
 */
const CategorizationSections = ({ uischema, schema, path, renderers, cells }: Props) => {
  const translate = useJsonForms().i18n?.translate
  const t = (key: StepperMessage, values?: Record<string, string | number>) => stepperText(translate, key, values)
  const host = useFormSteps()
  const categories = useVisibleCategories(uischema, path)
  const count = categories.length
  const links = host?.contentsLinks ?? []
  const withContents = count + links.length > 1

  const notifyHost = useEffectEvent(() => host?.onStepChange?.({ step: count, count, last: true }))
  useEffect(() => {
    notifyHost()
  }, [count])

  const sections = useRef<(HTMLElement | null)[]>([])
  const end = useRef<HTMLDivElement>(null)
  const current = useCurrentSection(sections, end, count, withContents)

  const idPrefix = useId()
  const sectionId = (index: number) => `${idPrefix}-section-${index}`
  const goTo = (target: HTMLElement | null) => {
    target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    const heading = target?.matches('h1, h2, h3, h4') ? target : target?.querySelector<HTMLElement>('h1, h2, h3, h4')
    if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading?.focus({ preventScroll: true })
  }
  const labels = categories.map((c) => categoryLabel(c, translate))
  const entries = [
    ...labels.map((label, index) => ({ label, go: () => goTo(sections.current[index]) })),
    ...links.map((link) => ({ label: link.label, go: () => goTo(document.getElementById(link.targetId)) })),
  ]

  const body = (
    <FormReviewContext.Provider value>
      <Flex direction="column" gap="6" p={{ initial: '4', sm: '6' }} style={panelStyle} data-form-review="">
        {categories.map((category, index) => (
          <section
            key={`${path}-${index}`}
            ref={(el) => {
              sections.current[index] = el
            }}
            aria-labelledby={sectionId(index)}
            style={{ scrollMarginTop: OFFSET }}
          >
            <Heading id={sectionId(index)} tabIndex={-1} size="3" as="h3" mb="3" style={{ outline: 'none' }}>
              {labels[index]}
            </Heading>
            <CategoryFields
              category={category}
              schema={schema}
              path={path}
              renderers={renderers}
              cells={cells}
              enabled={false}
            />
          </section>
        ))}
        <div ref={end} />
      </Flex>
    </FormReviewContext.Provider>
  )
  if (!withContents) return body

  return (
    <Flex gap="5" align="start">
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
        <nav aria-label={t('contentsLabel')}>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {entries.map((entry, index) => (
              <li key={`${path}-contents-${index}`} style={{ position: 'relative' }}>
                {index < entries.length - 1 && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 21,
                      top: 40,
                      bottom: -4,
                      width: 2,
                      borderRadius: 1,
                      background: 'var(--gray-a5)',
                    }}
                  />
                )}
                <StepLink
                  index={index}
                  label={entry.label}
                  status={index === current ? 'current' : 'todo'}
                  current="location"
                  onSelect={entry.go}
                />
              </li>
            ))}
          </ol>
        </nav>
      </Box>

      <Box style={{ flex: 1, minWidth: 0 }}>
        <Box display={{ initial: 'block', sm: 'none' }} mb="3">
          <Select.Root value="" onValueChange={(value) => entries[Number(value)]?.go()}>
            <Select.Trigger placeholder={t('jumpTo')} aria-label={t('jumpTo')} style={{ width: '100%' }} />
            <Select.Content position="popper">
              {entries.map((entry, index) => (
                <Select.Item key={`${path}-jump-${index}`} value={String(index)}>
                  {entry.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Box>
        {body}
      </Box>
    </Flex>
  )
}

/**
 * The index of the section being read: the last one whose top has scrolled to
 * the sticky offset, or the last section once the end of the form is on
 * screen. Listens to scrolling anywhere on the page, since the host may scroll
 * a container rather than the window.
 */
function useCurrentSection(
  sections: { current: (HTMLElement | null)[] },
  end: { current: HTMLElement | null },
  count: number,
  enabled: boolean,
): number {
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const update = () => {
      frame = 0
      let index = 0
      sections.current.slice(0, count).forEach((el, i) => {
        if (!el) return
        const offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
        if (el.getBoundingClientRect().top <= offset + 1) index = i
      })
      const endEl = end.current
      const first = sections.current[0]
      const last = sections.current[count - 1]
      const scrolledIn = first
        ? first.getBoundingClientRect().top <= (parseFloat(getComputedStyle(first).scrollMarginTop) || 0) + 1
        : false
      // Once scrolled into the form, its end on screen means the last section
      // can't scroll any higher. A form that fits on screen stays on its first.
      if (scrolledIn && endEl && last && endEl.getBoundingClientRect().top <= window.innerHeight && index < count - 1) {
        if (last.getBoundingClientRect().top < window.innerHeight) index = count - 1
      }
      setCurrent(index)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
    }
  }, [sections, end, count, enabled])
  return current
}

/** The Categories whose rules currently show them. */
function useVisibleCategories(uischema: Categorization, path: string): Category[] {
  const ctx = useJsonForms()
  const ajv = ctx.core?.ajv
  const data: unknown = ctx.core?.data
  const config: unknown = ctx.config
  return categoriesOf(uischema).filter((c) => !c.rule || !ajv || isVisible(c, data, path, ajv, config))
}

/** A Category's elements, one under another. */
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

/** A Category's label, translated as JSON Forms translates a layout's label. */
function categoryLabel(category: Category, translate: Translator | undefined): string {
  return deriveLabelForUISchemaElement(category, translate ?? defaultTranslator) ?? category.label
}

/** A Category's `options.description`, translated under the same key prefix as its label. */
function categoryDescription(category: Category | undefined, translate: Translator | undefined): string | undefined {
  const description = category?.options?.description as string | undefined
  if (!category || !description) return undefined
  const prefix = getI18nKeyPrefixBySchema(undefined, category)
  return (translate ?? defaultTranslator)(prefix ? `${prefix}.description` : description, description)
}
