export interface RoleMapperConfig<R extends string> {
  /** The claim holding the user's role names, e.g. `roles`. */
  claimName: string
  /** App role → role name in the claim. Matched roles are returned in this key order. */
  roles: Record<R, string>
}

/** Builds a function that maps ID-token claims to the app's own roles. A missing or malformed claim yields no roles. */
export function createRoleMapper<R extends string>(
  config: RoleMapperConfig<R>,
): (claims: Record<string, unknown> | null | undefined) => R[] {
  const entries = Object.entries(config.roles) as [R, string][]

  return (claims) => {
    const claim = claims?.[config.claimName]
    if (!Array.isArray(claim)) {
      return []
    }

    const names = new Set(claim.filter((value): value is string => typeof value === 'string'))
    return entries.filter(([, name]) => names.has(name)).map(([role]) => role)
  }
}
