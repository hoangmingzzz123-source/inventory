const utc7Formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

export function formatDateTimeUtc7(value: unknown) {
  if (!value) return ""
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  const parts = Object.fromEntries(utc7Formatter.formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.hour}:${parts.minute}:${parts.second} ${parts.day}/${parts.month}/${parts.year} UTC+7`
}

export function formatDateOnlyUtc7(value: unknown) {
  const formatted = formatDateTimeUtc7(value)
  return formatted ? formatted.slice(9) : ""
}