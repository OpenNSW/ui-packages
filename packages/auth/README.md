# @opennsw/auth

Shared OIDC setup for OpenNSW portals, on top of [`oidc-client-ts`](https://github.com/authts/oidc-client-ts): `UserManager` defaults, IdP config parsing, role mapping and bearer headers. Auth state in React comes from [`react-oidc-context`](https://github.com/authts/react-oidc-context).

## Install

```sh
pnpm add @opennsw/auth oidc-client-ts react-oidc-context
```

`oidc-client-ts` `^3.0.0` is a peer dependency.

## Use

```tsx
import { createUserManager, parseScopes } from '@opennsw/auth'
import { AuthProvider } from 'react-oidc-context'

const userManager = createUserManager({
  authority: 'https://idp.example',
  clientId: 'MY_APP',
  redirectUri: window.location.origin,
  scopes: parseScopes('openid, profile, email, role'),
})

export const Root = () => (
  <AuthProvider userManager={userManager}>
    <App />
  </AuthProvider>
)
```

## Documentation

Defaults, role mapping and authenticated requests: [usage guide](https://github.com/OpenNSW/ui-packages/blob/main/packages/auth/docs/usage.md).

- [Source and issues](https://github.com/OpenNSW/ui-packages)
- [Release notes](https://github.com/OpenNSW/ui-packages/releases?q=auth)

## License

[Apache-2.0](https://github.com/OpenNSW/ui-packages/blob/main/LICENSE)
