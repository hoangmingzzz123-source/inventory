const vndFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const quantityFormatter = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

function finiteNumber(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number) || Object.is(number, -0)) return 0
  return number
}

/** Format a VND amount for display without fractional dong. */
export function formatVnd(value: unknown) {
  return vndFormatter.format(finiteNumber(value))
}

/** Format counts and inventory quantities while preserving up to 2 decimals. */
export function formatQuantity(value: unknown) {
  return quantityFormatter.format(finiteNumber(value))
}
