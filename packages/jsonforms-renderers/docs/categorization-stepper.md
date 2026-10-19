# Categorization stepper

A `Categorization` renders as tabs by default. With `options.variant: "stepper"` it shows one `Category` at a time, for long forms where the trader needs to see how much is left:

```json
{
  "type": "Categorization",
  "options": { "variant": "stepper" },
  "elements": [
    { "type": "Category", "label": "Consignment", "elements": [ ... ] },
    { "type": "Category", "label": "Items", "options": { "description": "Add one item per product." }, "elements": [ ... ] }
  ]
}
```

- A step list at the side notes each step: **Done**, "2 items added", "4 fields", **Optional**, or a red count of what is left to fix. On narrow screens, "Step 2 of 5" sits above the step instead.
- **Continue** checks only the step on screen. If a control there has an error, or a required value that is present but empty (`""`, `[]`), the step does not change and a summary links to those fields.
- The last step, **Review and Submit**, shows every step read-only, each with an **Edit** button.
- A Category's `options.description` shows under its title. A Category hidden by its `rule` drops out of the steps.
- Every step stays mounted while off screen, so controls that write from effects (computed fields, spreadsheet sources, clearing a hidden field) behave as on a single-page form.
- A read-only form (`<JsonForms readonly>`) shows every step on one page, without the step list or buttons.

## The host's part

The stepper does not submit. Render `FormStepsProvider` around `<JsonForms>`:

```tsx
import { FormStepsProvider, isStepperUiSchema } from '@opennsw/jsonforms-renderers'

const [onLastStep, setOnLastStep] = useState(() => !isStepperUiSchema(uiSchema))

<FormStepsProvider
  onStepChange={({ last }) => setOnLastStep(last)}
  onInvalidStep={() => setShowErrors(true)}
  actions={<FormButtons submit={onLastStep} />}
>
  <JsonForms ... />
</FormStepsProvider>
```

- `onStepChange({ step, count, last })` fires on mount and on every step change; `last` is true on the review step. Offer the submit button only then.
- `onInvalidStep()` fires when Continue is refused. A host that renders with `validationMode="ValidateAndHide"` can switch to `ValidateAndShow` here, so the fields turn red too.
- `actions` is shown in the stepper's footer, between **Back** and **Continue**, so the form has one row of buttons. Pass **Save as draft** (on every step) and submit (on the last) here.
