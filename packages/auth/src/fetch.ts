import type { UserManager } from 'oidc-client-ts'

/** `{ Authorization: 'Bearer …' }` when the stored user has a valid access token, otherwise `{}`. */
export async function authHeader(userManager: UserManager): Promise<Record<string, string>> {
  const user = await userManager.getUser()
  return user && !user.expired ? { Authorization: `Bearer ${user.access_token}` } : {}
}
