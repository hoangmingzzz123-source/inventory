export const defaultCompanySettings = {
  name: "WarehouseOS Demo Co., Ltd.",
  representative: "Nguyễn Văn A",
  taxId: "0123456789",
  address: "123 Đường ABC, Quận 1, TP.HCM",
  phone: "+84 28 1234 5678",
  website: "https://warehouseos.vn",
  email: "contact@warehouseos.vn",
  logoUrl: "",
  costingMethod: "FIFO",
}

export type CompanySettings = typeof defaultCompanySettings

export function loadCompanySettings(orgId?: string): CompanySettings {
  try {
    const saved = window.localStorage.getItem(`company-settings:${orgId || "demo"}`)
    return saved ? { ...defaultCompanySettings, ...JSON.parse(saved) } : defaultCompanySettings
  } catch {
    return defaultCompanySettings
  }
}

export function saveCompanySettings(settings: CompanySettings, orgId?: string) {
  window.localStorage.setItem(`company-settings:${orgId || "demo"}`, JSON.stringify(settings))
}
