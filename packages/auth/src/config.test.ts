import { describe, expect, it } from 'vitest'
import { parseExtraQueryParams, parseScopes } from './config.ts'

describe('parseScopes', () => {
  it('splits on commas and spaces', () => {
    expect(parseScopes('openid, profile email,role')).toEqual(['openid', 'profile', 'email', 'role'])
  })

  it('returns undefined when blank', () => {
    expect(parseScopes(undefined)).toBeUndefined()
    expect(parseScopes('  ')).toBeUndefined()
  })
})

describe('parseExtraQueryParams', () => {
  it('parses a query string', () => {
    expect(parseExtraQueryParams('resource=https%3A%2F%2Fapi.example&prompt=consent')).toEqual({
      resource: 'https://api.example',
      prompt: 'consent',
    })
  })

  it('returns an empty map when blank', () => {
    expect(parseExtraQueryParams(undefined)).toEqual({})
    expect(parseExtraQueryParams(' ')).toEqual({})
  })

  it('rejects parameters the OIDC client sets itself', () => {
    expect(() => parseExtraQueryParams('resource=x&redirect_uri=https://evil.example')).toThrow(
      '"redirect_uri" is set by the OIDC client',
    )
    expect(() => parseExtraQueryParams('response_mode=form_post')).toThrow('"response_mode"')
    expect(() => parseExtraQueryParams('dpop_jkt=abc')).toThrow('"dpop_jkt"')
  })
})
