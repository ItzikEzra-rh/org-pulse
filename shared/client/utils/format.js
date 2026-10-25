/**
 * Format an ISO date string for display.
 *
 * @param {string|null|undefined} iso - ISO 8601 date string
 * @param {Object} [options]
 * @param {string} [options.fallback='Never'] - Value to return when iso is falsy
 * @param {boolean} [options.includeTime=true] - When true uses toLocaleString (date + time),
 *   when false uses toLocaleDateString (date only)
 * @returns {string}
 */
export function formatDate(iso, options) {
  var fallback = (options && options.fallback != null) ? options.fallback : 'Never'
  var includeTime = (options && options.includeTime != null) ? options.includeTime : true

  if (!iso) return fallback
  if (includeTime) {
    return new Date(iso).toLocaleString()
  }
  return new Date(iso).toLocaleDateString()
}

const DAY_MS = 86400000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Parse a bare YYYY-MM-DD (local midnight) or ISO timestamp; null if invalid. */
export function parseDateValue(value) {
  if (!value) return null
  const text = String(value)
  if (DATE_ONLY.test(text)) {
    const [year, month, day] = text.split('-').map(Number)
    return { at: new Date(year, month - 1, day).getTime(), dateOnly: true }
  }
  const at = Date.parse(text)
  return Number.isFinite(at) ? { at, dateOnly: false } : null
}

/** Format a past date as a human age (bare dates compare by calendar day). */
export function formatRelativeTime(value, now = Date.now()) {
  const parsed = parseDateValue(value)
  if (!parsed) return value ? 'unknown' : 'never'
  if (parsed.dateOnly) {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const days = Math.round((today.getTime() - parsed.at) / DAY_MS)
    if (days <= 0) return 'today'
    return days === 1 ? 'yesterday' : `${days} days ago`
  }
  const hours = Math.floor(Math.max(0, now - parsed.at) / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}
