// Reads a dot-path off a plain object, distinguishing "not present" from a legitimately falsy/undefined value.
export function readByPath(obj: unknown, path: string): { found: boolean; value: unknown } {
  if (path === '') return { found: true, value: obj }

  let current: unknown = obj
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return { found: false, value: undefined }
    if (!(key in (current as Record<string, unknown>))) return { found: false, value: undefined }
    current = (current as Record<string, unknown>)[key]
  }
  return { found: true, value: current }
}