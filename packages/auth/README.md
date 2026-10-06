# @opennsw/auth

Shared OIDC setup for OpenNSW portals, on top of [`oidc-client-ts`](https://github.com/authts/oidc-client-ts). Auth state in React comes from [`react-oidc-context`](https://github.com/authts/react-oidc-context); this package covers what it does not: `UserManager` defaults, IdP config parsing, role mapping and bearer headers.

```sh
pnpm add @opennsw/auth oidc-client-ts react-oidc-context
```

## UserManager

```ts
import { createUserManager, parseExtraQueryParams, parseScopes } from '@opennsw/auth'

export const userManager = createUserManager({
  authority: 'https://idp.example',
  clientId: 'MY_APP',
  redirectUri: window.location.origin,
  scopes: parseScopes('openid, profile, email, role'),
  extraQueryParams: parseExtraQueryParams('resource=https://api.example'),
})
```

```tsx
<AuthProvider userManager={userManager}>
  <App />
</AuthProvider>
```

| Field                   | Default                                       |
| ----------------------- | --------------------------------------------- |
| `postLogoutRedirectUri` | `redirectUri`                                 |
| `scopes`                | `['openid', 'profile', 'email']`              |
| `storage`               | `sessionStorage`                              |
| `automaticSilentRenew`  | `true`                                        |
| `userSettings`          | Any other `UserManagerSettings`, applied last |

`parseScopes` splits a comma- or space-separated list. `parseExtraQueryParams` reads a query string and throws if it sets a parameter the OIDC client owns, such as `redirect_uri` or `state`.

## Roles

```ts
import { createRoleMapper } from '@opennsw/auth'

const mapRoles = createRoleMapper({
  claimName: 'roles',
  roles: { trader: 'Trader', admin: 'NSW Admin' }, // app role → name in the claim
})

mapRoles(auth.user?.profile) // ('trader' | 'admin')[], in key order
```

## Requests

```ts
import { authHeader } from '@opennsw/auth'

fetch(url, { headers: { ...(await authHeader(userManager)) } }) // adds the token only while it is valid
```

## Development

From the repo root: `pnpm --filter @opennsw/auth run test` (or `type-check`, `build`). Lint and formatting use the repo-wide config.
