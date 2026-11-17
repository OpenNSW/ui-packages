const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-01-01` becomes `1 Jan 2026`. A value that is not a calendar day is left as written. */
function formatDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return value
  return `${Number(match[3])} ${month} ${match[1]}`
}

export const getErrorMessage = (errors: string, label?: string): string => {
  if (!errors) return ''
  const field = label || 'This field'
  return errors
    .split('\n')
    .map((err) => {
      const trimmed = err.trim()
      if (trimmed === 'is a required property') {
        return `${field} is required`
      }
      if (trimmed.startsWith('must be > ')) {
        return `${field} must be greater than ${trimmed.slice('must be > '.length)}`
      }
      if (trimmed.startsWith('must be >= ')) {
        return `${field} must be at least ${trimmed.slice('must be >= '.length)}`
      }
      if (trimmed.startsWith('must be multiple of ')) {
        return `${field} must be a multiple of ${trimmed.slice('must be multiple of '.length)}`
      }
      const formatBound = /^should be >= (\S+)$/.exec(trimmed)
      if (formatBound) {
        const limit = formatBound[1]
        if (limit === 'today') return `${field} must be today or later`
        return `${field} must be on or after ${formatDay(limit)}`
      }
      return err
    })
    .join('\n')
}
