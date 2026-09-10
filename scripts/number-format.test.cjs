const assert = require("node:assert/strict")
const test = require("node:test")

test("VND values never expose fractional dong", async () => {
  const { formatVnd } = await import("../src/lib/numberFormat.ts")

  assert.equal(formatVnd(9_765_000.001), "9.765.000")
  assert.equal(formatVnd(9_765_000.6), "9.765.001")
  assert.equal(formatVnd(undefined), "0")
})

test("inventory quantities preserve at most two decimals", async () => {
  const { formatQuantity } = await import("../src/lib/numberFormat.ts")

  assert.equal(formatQuantity(12), "12")
  assert.equal(formatQuantity(12.5), "12,5")
  assert.equal(formatQuantity(12.345), "12,35")
})
