import type { UserManager } from 'oidc-client-ts'

/**
 * `{ Authorization: 'Bearer …' }` when the stored user has an unexpired access token, otherwise `{}`.
 * A token with no known expiry is sent; the resource server is the final judge of its validity.
 */
export async function authHeader(userManager: UserManager): Promise<Record<string, string>> {
  const user = await userManager.getUser()
  return user?.access_token && user.expired !== true ? { Authorization: `Bearer ${user.access_token}` } : {}
}
