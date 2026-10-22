import type { Translator } from '@jsonforms/core'
import { describe, expect, it } from 'vitest'
import { listText } from './messages'

const translate = ((id: string, defaultMessage?: string) => {
  if (id === 'attachments.list.addItem') return 'Ajouter une pièce jointe'
  if (id === 'list.addItem') return 'Ajouter'
  if (id === 'list.empty') return 'Rien.'
  return defaultMessage
}) as Translator

describe('listText', () => {
  it('uses the control key before the global one', () => {
    expect(listText(translate, 'addItem', undefined, 'attachments')).toBe('Ajouter une pièce jointe')
  })

  it('falls back to the global key, then the English default', () => {
    expect(listText(translate, 'empty', undefined, 'attachments')).toBe('Rien.')
    expect(listText(translate, 'remove', undefined, 'attachments')).toBe('Remove')
  })

  it('ignores a prefix when there is no translator', () => {
    expect(listText(undefined, 'addItem', undefined, 'attachments')).toBe('Add Item')
  })
})
