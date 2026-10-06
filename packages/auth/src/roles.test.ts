import { describe, expect, it } from 'vitest'
import { createRoleMapper } from './roles.ts'

const mapRoles = createRoleMapper({
  claimName: 'roles',
  roles: { trader: 'Trader', admin: 'NSW Admin', cha: 'CHA' },
})

describe('createRoleMapper', () => {
  it('maps claim values to app roles, in config order', () => {
    expect(mapRoles({ roles: ['CHA', 'Trader', 'Unrelated'] })).toEqual(['trader', 'cha'])
  })

  it('ignores non-string values', () => {
    expect(mapRoles({ roles: ['NSW Admin', 42, null] })).toEqual(['admin'])
  })

  it('returns no roles for a missing or malformed claim', () => {
    expect(mapRoles(undefined)).toEqual([])
    expect(mapRoles({})).toEqual([])
    expect(mapRoles({ roles: 'Trader' })).toEqual([])
  })
})
