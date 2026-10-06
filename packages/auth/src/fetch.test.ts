import { describe, expect, it } from 'vitest'
import type { User, UserManager } from 'oidc-client-ts'
import { authHeader } from './fetch.ts'

function managerWithUser(user: Partial<User> | null): UserManager {
  return { getUser: () => Promise.resolve(user) } as UserManager
}

describe('authHeader', () => {
  it('returns a bearer header for a valid token', async () => {
    expect(await authHeader(managerWithUser({ access_token: 'abc', expired: false }))).toEqual({
      Authorization: 'Bearer abc',
    })
  })

  it('returns nothing when signed out or expired', async () => {
    expect(await authHeader(managerWithUser(null))).toEqual({})
    expect(await authHeader(managerWithUser({ access_token: 'abc', expired: true }))).toEqual({})
  })
})
