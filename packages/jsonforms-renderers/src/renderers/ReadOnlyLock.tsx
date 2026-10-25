import { TextField } from '@radix-ui/themes'
import { LockClosedIcon } from '@radix-ui/react-icons'

/**
 * The lock at the end of a read-only field in an editable form, so it can't
 * be mistaken for one to type in. Decorative: the disabled input already
 * tells assistive technology it can't be changed.
 */
export function ReadOnlyLock() {
  return (
    <TextField.Slot side="right">
      <LockClosedIcon aria-hidden data-testid="read-only-lock" style={{ color: 'var(--gray-10)' }} />
    </TextField.Slot>
  )
}
