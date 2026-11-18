// Field helpers shared by the API key pages and the shared create dialog.

export function parseCSV(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseQuotaLimit(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return "0"
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "0"
  }
  return trimmed
}

export function quotaInputValue(value: string | number) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ""
  }
  return String(value)
}

export function dateTimeLocalValue(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
