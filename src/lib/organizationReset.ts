import { supabase } from "./supabase"

export async function verifyResetCodeAndResetOrganization({
  code,
  orgId,
}: {
  code: string
  orgId: string
}) {
  const { error } = await (supabase as any).rpc("reset_organization_data", {
    p_confirmation_code: code,
  })
  if (error) return { error: error.message ?? String(error) }

  try {
    window.localStorage.removeItem(`company-settings:${orgId}`)
    window.localStorage.removeItem(`warehouseos-notifications:org:${orgId}`)
  } catch {
    // The database reset succeeded; browser storage may be unavailable.
  }

  return { error: null }
}
