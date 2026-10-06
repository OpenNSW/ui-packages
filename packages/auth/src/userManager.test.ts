import { describe, expect, it, vi } from 'vitest'
import { createUserManager } from './userManager.ts'

vi.mock('oidc-client-ts', () => ({
  UserManager: class {
    settings: unknown
    constructor(settings: unknown) {
      this.settings = settings
    }
  },
  WebStorageStateStore: class {},
}))

const config = { authority: 'https://idp.example', clientId: 'app', redirectUri: 'https://app.example' }

function settingsOf(manager: unknown): unknown {
  return (manager as { settings: unknown }).settings
}

describe('createUserManager', () => {
  it('applies defaults', () => {
    expect(settingsOf(createUserManager(config))).toMatchObject({
      authority: 'https://idp.example',
      client_id: 'app',
      redirect_uri: 'https://app.example',
      post_logout_redirect_uri: 'https://app.example',
      scope: 'openid profile email',
      automaticSilentRenew: true,
      userStore: undefined,
    })
  })

  it('wraps supplied storage in a user store', () => {
    const manager = createUserManager({ ...config, storage: {} as Storage })

    expect((settingsOf(manager) as { userStore: unknown }).userStore).toBeDefined()
  })

  it('passes config through, with userSettings applied last', () => {
    const manager = createUserManager({
      ...config,
      scopes: ['openid', 'roles'],
      extraQueryParams: { resource: 'https://api.example' },
      userSettings: { automaticSilentRenew: false },
    })

    expect(settingsOf(manager)).toMatchObject({
      scope: 'openid roles',
      extraQueryParams: { resource: 'https://api.example' },
      automaticSilentRenew: false,
    })
  })
})
