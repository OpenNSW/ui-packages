// AJV format "time" is RFC 3339, so seconds are required. Native <input type="time">
// with minute precision (the default) emits HH:MM; pad those to HH:MM:SS.
export const toRfc3339Time = (raw: string): string | undefined => {
  if (!raw) return undefined
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`
  return raw
}

// Native time inputs only understand HH:MM or HH:MM:SS. Strip timezone suffixes
// from stored RFC 3339 values, and drop seconds when the seconds spinner is off.
export const timeInputValue = (stored: string, showSeconds: boolean): string => {
  if (!stored) return ''
  const match = stored.match(/^(\d{2}:\d{2})(:\d{2})?/)
  if (!match) return stored
  return showSeconds ? `${match[1]}${match[2] ?? ':00'}` : match[1]
}
