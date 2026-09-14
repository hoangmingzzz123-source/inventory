export const defaultCompanySettings = {
  name: "CÔNG TY CỔ PHẦN ĐẦU TƯ SẢN XUẤT VÀ THƯƠNG MẠI H2T",
  englishName: "H2T INVESTMENT PRODUCTION AND TRADING JOINT STOCK COMPANY",
  representative: "",
  taxId: "",
  address: "Thôn Kim Hoàng, Xã Vân Canh, Huyện Hoài Đức, Thành phố Hà Nội, Việt Nam",
  phone: "",
  website: "",
  email: "h2t.jsc3@gmail.com",
  logoUrl: "",
  bankAccountName: "CÔNG TY CPĐT SẢN XUẤT VÀ THƯƠNG MẠI H2T",
  bankAccountNumber: "91599",
  bankName: "Ngân hàng Techcombank",
  bankBranch: "Chi nhánh Hà Tây",
  costingMethod: "FIFO",
}

export type CompanySettings = typeof defaultCompanySettings

export const defaultQuotationSettings = {
  defaultTitle: "BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG",
  defaultPaymentTerms: "Thanh toán 100% trước khi giao hàng.\nThanh toán tiền mặt hoặc chuyển khoản.",
  defaultDeliveryTerms: "Nhận hàng từ 05–07 ngày kể từ khi thanh toán.",
  defaultValidityDays: 7,
  defaultIncludeShipping: true,
  defaultFooterNotes: "",
}

export type QuotationSettings = typeof defaultQuotationSettings

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
