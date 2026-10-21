import { AlertDialog, Button, Flex } from '@radix-ui/themes'

/**
 * Asks before something is removed. Radix moves focus to the keep button when
 * it opens, so pressing Enter or Escape never removes anything by accident.
 */
export function ConfirmRemoveDialog({
  open,
  onOpenChange,
  title,
  description,
  keepLabel,
  removeLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  keepLabel: string
  removeLabel: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="460px">
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description size="2">{description}</AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button type="button" variant="soft" color="gray">
              {keepLabel}
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button type="button" color="red" onClick={onConfirm}>
              {removeLabel}
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
