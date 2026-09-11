export const demoFeatureEnabled =
  String(import.meta.env.VITE_DEMO_FEATURE_ENABLED ?? "true").toLowerCase() !== "false"

export const DEMO_VISIBILITY_EVENT = "warehouseos:demo-visibility"

function preferenceKey(userId?: string | null) {
  return `warehouseos:demo-feature-hidden:${userId || "anonymous"}`
}

export function isDemoFeatureHidden(userId?: string | null) {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(preferenceKey(userId)) === "true"
}

export function setDemoFeatureHidden(hidden: boolean, userId?: string | null) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(preferenceKey(userId), String(hidden))
  window.dispatchEvent(
    new CustomEvent(DEMO_VISIBILITY_EVENT, { detail: { hidden, userId } }),
  )
}
