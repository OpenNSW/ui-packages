/** Normalize a native time input value for AJV `format: "time"` (RFC 3339 `HH:MM:SS`). */
export const toRfc3339Time = (raw: string): string | undefined => {
  if (!raw) return undefined
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`
  return raw
}

/** Format a stored time for a native `<input type="time">`, optionally hiding seconds. */
export const timeInputValue = (stored: string, showSeconds: boolean): string => {
  if (!stored) return ''
  const match = stored.match(/^(\d{2}:\d{2})(:\d{2})?/)
  if (!match) return stored
  return showSeconds ? `${match[1]}${match[2] ?? ':00'}` : match[1]
}
