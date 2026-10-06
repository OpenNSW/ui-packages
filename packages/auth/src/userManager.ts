import { UserManager, WebStorageStateStore } from 'oidc-client-ts'
import { DEFAULT_SCOPES, type AuthConfig } from './config.ts'

/** Builds a `UserManager` from {@link AuthConfig}, for use with react-oidc-context's `AuthProvider`. */
export function createUserManager(config: AuthConfig): UserManager {
  return new UserManager({
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.postLogoutRedirectUri ?? config.redirectUri,
    scope: (config.scopes ?? DEFAULT_SCOPES).join(' '),
    extraQueryParams: config.extraQueryParams,
    // Unset, oidc-client-ts uses sessionStorage in the browser and memory elsewhere.
    userStore: config.storage ? new WebStorageStateStore({ store: config.storage }) : undefined,
    automaticSilentRenew: config.automaticSilentRenew ?? true,
    ...config.userSettings,
  })
}
