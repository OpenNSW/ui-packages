import type { UserManagerSettings } from 'oidc-client-ts'

export interface AuthConfig {
  authority: string
  clientId: string
  redirectUri: string
  /** Defaults to `redirectUri`. */
  postLogoutRedirectUri?: string
  /** Defaults to {@link DEFAULT_SCOPES}. */
  scopes?: string[]
  /** Extra authorize-request parameters, e.g. RFC 8707 `resource`. See {@link parseExtraQueryParams}. */
  extraQueryParams?: Record<string, string>
  /** Where the signed-in user is kept. Defaults to `sessionStorage`, or memory outside the browser. */
  storage?: Storage
  /** Defaults to true. */
  automaticSilentRenew?: boolean
  /** Any other oidc-client-ts setting. Applied last, so it overrides the fields above. */
  userSettings?: Partial<UserManagerSettings>
}

export const DEFAULT_SCOPES = ['openid', 'profile', 'email']

/** Splits a comma- or space-separated scope list, e.g. `openid, profile email`. Blank yields undefined. */
export function parseScopes(raw: string | undefined): string[] | undefined {
  if (!raw || raw.trim() === '') {
    return undefined
  }

  return raw.split(/[\s,]+/).filter(Boolean)
}

// Set by oidc-client-ts itself; overriding one corrupts the authorization request.
const RESERVED_AUTHORIZE_PARAMS = new Set([
  'client_id',
  'redirect_uri',
  'response_type',
  'scope',
  'state',
  'nonce',
  'code_challenge',
  'code_challenge_method',
  'response_mode',
  'dpop_jkt',
])

/**
 * Reads a query-string-encoded parameter map, e.g. `resource=https://api.example&prompt=consent`.
 * Blank yields an empty map. Throws if a parameter the OIDC client sets itself is present.
 */
export function parseExtraQueryParams(raw: string | undefined): Record<string, string> {
  if (!raw || raw.trim() === '') {
    return {}
  }

  const params: Record<string, string> = {}
  for (const [key, value] of new URLSearchParams(raw)) {
    if (RESERVED_AUTHORIZE_PARAMS.has(key)) {
      throw new Error(`"${key}" is set by the OIDC client and must not be overridden`)
    }
    params[key] = value
  }

  return params
}
