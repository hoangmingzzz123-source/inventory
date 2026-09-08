export type ReportSourceRow = Record<string, any>

export function deriveLedgerBalance(rows: ReportSourceRow[]) {
  const groups = new Map<string, ReportSourceRow>()
  for (const row of rows) {
    const key = `${row.product_id ?? row.sku}:${row.warehouse_id ?? row.warehouse_name ?? ""}`
    const current = groups.get(key) ?? { ...row, qty: 0, value: 0 }
    current.qty += Number(row.qty_in ?? 0) - Number(row.qty_out ?? 0)
    current.value += (Number(row.qty_in ?? 0) - Number(row.qty_out ?? 0)) * Number(row.unit_cost ?? 0)
    groups.set(key, current)
  }
  return Array.from(groups.values())
}

export function buildAgingBuckets(rows: ReportSourceRow[], amountKeys: string[]) {
  const buckets: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }
  for (const row of rows) {
    const amount = amountKeys.reduce((value, key) => value || Number(row[key] ?? 0), 0)
    const dateValue = row.due_date ?? row.due ?? row.created_at ?? new Date().toISOString()
    const age = Math.max(0, Math.floor((Date.now() - new Date(dateValue).getTime()) / 86400000))
    const bucket = age <= 30 ? "0-30" : age <= 60 ? "31-60" : age <= 90 ? "61-90" : "90+"
    buckets[bucket] += amount
  }
  return buckets
}

export function calculateCashBalance(rows: ReportSourceRow[]) {
  return rows.reduce((sum, row) => sum + (String(row.type).toLowerCase() === "receipt" ? Number(row.amount ?? 0) : -Number(row.amount ?? 0)), 0)
}

export function filterReportRows(rows: ReportSourceRow[], filters: { from?: string; to?: string; warehouseId?: string; productId?: string; status?: string }) {
  const inRange = (value: unknown) => {
    const date = String(value ?? "").slice(0, 10)
    return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
  }
  return rows.filter(row => {
    const warehouseMatches = !filters.warehouseId || String(row.warehouse_id ?? "") === filters.warehouseId
    const productMatches = !filters.productId || String(row.product_id ?? "") === filters.productId
    const statusMatches = !filters.status || String(row.status ?? "").toLowerCase() === filters.status.toLowerCase()
    return inRange(row.created_at ?? row.date) && warehouseMatches && productMatches && statusMatches
  })
}
