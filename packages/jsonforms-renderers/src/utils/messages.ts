import { type Translator, defaultTranslator } from '@jsonforms/core'

export type MessageValues = Record<string, string | number>

/**
 * A renderer's own wording, looked up through the form's JSON Forms
 * `i18n.translate` under `id`, with `fallback` (English) as the default.
 * `{name}` placeholders are filled in after translation, so a translation
 * keeps them.
 */
export function formatMessage(
  translate: Translator | undefined,
  id: string,
  fallback: string,
  values?: MessageValues,
): string {
  const message = (translate ?? defaultTranslator)(id, fallback, values)
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    values && name in values ? String(values[name]) : match,
  )
}

/** The list control's wording, looked up as `list.<key>`. */
export const LIST_MESSAGES = {
  addItem: 'Add Item',
  remove: 'Remove',
  removeItem: 'Remove {item}',
  confirmTitle: 'Remove {item}?',
  confirmDescription: "Its answers are removed too. This can't be undone.",
  keepItem: 'Keep item',
  removeConfirmed: 'Remove item',
  removed: '{item} removed.',
  empty: 'No items have been added yet.',
} as const

/** The upload control's wording, looked up as `upload.<key>`. */
export const UPLOAD_MESSAGES = {
  moreActions: 'More actions for {file}',
  remove: 'Remove',
  confirmTitle: 'Remove {file}?',
  confirmDescription: 'The file is removed from this form.',
  keepFile: 'Keep file',
  removeConfirmed: 'Remove file',
  removed: '{file} removed.',
  uploaded: 'Uploaded',
} as const

export type ListMessage = keyof typeof LIST_MESSAGES
export type UploadMessage = keyof typeof UPLOAD_MESSAGES

export const listText = (translate: Translator | undefined, key: ListMessage, values?: MessageValues) =>
  formatMessage(translate, `list.${key}`, LIST_MESSAGES[key], values)

export const uploadText = (translate: Translator | undefined, key: UploadMessage, values?: MessageValues) =>
  formatMessage(translate, `upload.${key}`, UPLOAD_MESSAGES[key], values)
