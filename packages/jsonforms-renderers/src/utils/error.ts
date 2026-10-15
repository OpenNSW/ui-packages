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
      return err
    })
    .join('\n')
}
