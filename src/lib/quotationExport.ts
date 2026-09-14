import { saveExcelWorkbook } from "./excelUtils"
import { formatVnd } from "./numberFormat"
import type { CompanySettings } from "./companySettings"

export type QuotationRenderItem = {
  index: number
  proposedGoods: string
  offeredGoods: string
  specificationBrand: string
  unit: string
  quantity: number
  unitPrice: number
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  note: string
}

export type QuotationRenderModel = {
  quotationId?: string
  quotationNumber: string
  quotationVersion: number
  title: string
  date: string
  validUntil: string
  project: string
  salesperson: string
  salespersonPhone: string
  company: CompanySettings
  customer: {
    name: string
    representative: string
    address: string
    phone: string
    email: string
    taxCode: string
  }
  items: QuotationRenderItem[]
  totals: {
    subtotal: number
    discount: number
    beforeVat: number
    vat: number
    grandTotal: number
  }
  terms: {
    includeShipping: boolean
    payment: string
    delivery: string
    footerNotes: string
    quotationNotes: string
  }
}

type BuildRenderModelInput = {
  id?: string
  quotationNumber?: string
  version?: number
  title?: string
  date: string
  validUntil: string
  project?: string
  salesperson?: string
  salespersonPhone?: string
  company: CompanySettings
  customer: Record<string, any>
  items: Record<string, any>[]
  subtotal: number
  discountAmount: number
  totalBeforeVat: number
  totalVat: number
  finalTotal: number
  includeShipping?: boolean
  paymentTerms?: string
  deliveryTerms?: string
  footerNotes?: string
  notes?: string
}

export function buildQuotationRenderModel(input: BuildRenderModelInput): QuotationRenderModel {
  return {
    quotationId: input.id,
    quotationNumber: input.quotationNumber || input.id || "BẢN NHÁP",
    quotationVersion: Number(input.version ?? 0),
    title: input.title || "BẢNG BÁO GIÁ KIÊM XÁC NHẬN ĐẶT HÀNG",
    date: input.date,
    validUntil: input.validUntil,
    project: input.project || "",
    salesperson: input.salesperson || "",
    salespersonPhone: input.salespersonPhone || "",
    company: input.company,
    customer: {
      name: input.customer.name ?? input.customer.label ?? "",
      representative: input.customer.representative ?? "",
      address: input.customer.address ?? "",
      phone: input.customer.phone ?? "",
      email: input.customer.email ?? "",
      taxCode: input.customer.tax_code ?? input.customer.taxCode ?? "",
    },
    items: input.items.map((item, index) => {
      const quantity = Number(item.qty ?? item.quantity ?? 0)
      const unitPrice = Number(item.selling_price ?? item.unit_price ?? 0)
      const grossSubtotal = quantity * unitPrice
      const discountShare = input.subtotal > 0
        ? grossSubtotal / input.subtotal * input.discountAmount
        : 0
      const subtotal = Math.max(grossSubtotal - discountShare, 0)
      const hasVat = item.has_vat ?? Number(item.vat_pct ?? 0) > 0
      const vatRate = hasVat ? Number(item.vat_pct ?? 0) : 0
      const vatAmount = subtotal * vatRate / 100
      return {
        index: index + 1,
        proposedGoods: item.category_name ?? item.product_name ?? "",
        offeredGoods: item.offered_description ?? item.category_name ?? item.product_name ?? "",
        specificationBrand: item.specification_brand ?? "",
        unit: item.sell_unit ?? item.unit_snapshot ?? "",
        quantity,
        unitPrice,
        subtotal,
        vatRate,
        vatAmount,
        total: subtotal + vatAmount,
        note: item.note ?? "",
      }
    }),
    totals: {
      subtotal: Number(input.subtotal || 0),
      discount: Number(input.discountAmount || 0),
      beforeVat: Number(input.totalBeforeVat || 0),
      vat: Number(input.totalVat || 0),
      grandTotal: Number(input.finalTotal || 0),
    },
    terms: {
      includeShipping: input.includeShipping ?? true,
      payment: input.paymentTerms || "",
      delivery: input.deliveryTerms || "",
      footerNotes: input.footerNotes || "",
      quotationNotes: input.notes || "",
    },
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function htmlLines(value: unknown) {
  return escapeHtml(value).replace(/\n/g, "<br />")
}

export function renderQuotationHtml(model: QuotationRenderModel, logoUrl = "") {
  const renderItemRows = (items: QuotationRenderItem[]) => items.map(item => `<tr>
    <td class="center">${item.index}</td>
    <td>${escapeHtml(item.proposedGoods)}</td>
    <td>${escapeHtml(item.offeredGoods)}</td>
    <td>${escapeHtml(item.specificationBrand)}</td>
    <td class="center">${escapeHtml(item.unit)}</td>
    <td class="number">${item.quantity.toLocaleString("vi-VN")}</td>
    <td class="number">${formatVnd(item.unitPrice)}</td>
    <td class="number">${formatVnd(item.subtotal)}</td>
    <td class="number">${item.vatRate ? `${item.vatRate}%` : "0%"}</td>
    <td class="number">${formatVnd(item.vatAmount)}</td>
    <td class="number strong">${formatVnd(item.total)}</td>
    <td>${escapeHtml(item.note)}</td>
  </tr>`).join("")
  const shipping = model.terms.includeShipping
    ? "Báo giá đã bao gồm chi phí vận chuyển."
    : "Báo giá chưa bao gồm chi phí vận chuyển."
  const header = (compact = false) => `<header class="company${compact ? " compact" : ""}">
      <div>${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" />` : ""}</div>
      <div><h2>${escapeHtml(model.company.name)}</h2><div class="english">${escapeHtml(model.company.englishName)}</div><div>${escapeHtml(model.company.address)}</div><div>${escapeHtml(model.company.email)}${model.company.phone ? ` · ${escapeHtml(model.company.phone)}` : ""}</div></div>
      <div><b>Tài khoản:</b> ${escapeHtml(model.company.bankAccountName)}<br/><b>Số TK:</b> ${escapeHtml(model.company.bankAccountNumber)}<br/><b>Ngân hàng:</b> ${escapeHtml(model.company.bankName)}<br/><b>Chi nhánh:</b> ${escapeHtml(model.company.bankBranch)}</div>
    </header>`
  const title = `<h1>${escapeHtml(model.title)}</h1>`
  const meta = `<section class="meta">
      <div><b>Khách hàng:</b> ${escapeHtml(model.customer.name)}</div><div><b>Báo giá số:</b> ${escapeHtml(model.quotationNumber)}</div>
      <div><b>Người liên hệ:</b> ${escapeHtml(model.customer.representative)}</div><div><b>Ngày:</b> ${escapeHtml(model.date)}</div>
      <div><b>Địa chỉ:</b> ${escapeHtml(model.customer.address)}</div><div><b>Hiệu lực đến:</b> ${escapeHtml(model.validUntil)}</div>
      <div><b>Điện thoại:</b> ${escapeHtml(model.customer.phone)}</div><div><b>Nhân viên báo giá:</b> ${escapeHtml(model.salesperson)}</div>
      <div><b>Email:</b> ${escapeHtml(model.customer.email)}</div><div><b>SĐT nhân viên:</b> ${escapeHtml(model.salespersonPhone)}</div>
      <div><b>Dự án:</b> ${escapeHtml(model.project)}</div><div><b>MST:</b> ${escapeHtml(model.customer.taxCode)}</div>
    </section>`
  const table = (items: QuotationRenderItem[]) => `<table><colgroup><col style="width:3%"/><col style="width:12%"/><col style="width:15%"/><col style="width:13%"/><col style="width:5%"/><col style="width:5%"/><col style="width:8%"/><col style="width:11%"/><col style="width:5%"/><col style="width:8%"/><col style="width:10%"/><col style="width:5%"/></colgroup>
      <thead><tr><th>STT</th><th>Hàng hóa đề xuất</th><th>Hàng hóa cung cấp</th><th>Quy cách / Nhãn hiệu</th><th>Đơn vị</th><th>KL</th><th>Đơn giá</th><th>Thành tiền trước thuế</th><th>VAT (%)</th><th>Tiền thuế</th><th>Thành tiền sau thuế</th><th>Ghi chú</th></tr></thead>
      <tbody>${renderItemRows(items) || '<tr><td colspan="12" class="center muted">Chưa có hàng hóa</td></tr>'}</tbody>
    </table>`
  const summary = `<section class="totals">
      <div class="total-row"><span>Cộng tiền hàng</span><b>${formatVnd(model.totals.subtotal)}</b></div>
      <div class="total-row"><span>Chiết khấu</span><b>${formatVnd(model.totals.discount)}</b></div>
      <div class="total-row"><span>Tiền trước VAT</span><b>${formatVnd(model.totals.beforeVat)}</b></div>
      <div class="total-row"><span>Tổng VAT</span><b>${formatVnd(model.totals.vat)}</b></div>
      <div class="total-row grand"><span>TỔNG THANH TOÁN</span><span>${formatVnd(model.totals.grandTotal)}</span></div>
    </section>
    <section class="terms"><b>Điều khoản:</b><br/>• ${shipping}<br/>• ${htmlLines(model.terms.payment)}<br/>• ${htmlLines(model.terms.delivery)}<br/>• Báo giá có hiệu lực đến ${escapeHtml(model.validUntil)}.${model.terms.footerNotes ? `<br/>• ${htmlLines(model.terms.footerNotes)}` : ""}${model.terms.quotationNotes ? `<br/><b>Ghi chú báo giá:</b> ${htmlLines(model.terms.quotationNotes)}` : ""}</section>
    <section class="signatures"><div><b>ĐẠI DIỆN KHÁCH HÀNG</b><span>(Ký, ghi rõ họ tên)</span></div><div><b>ĐẠI DIỆN CÔNG TY</b><span>(Ký, ghi rõ họ tên, đóng dấu)</span></div></section>`

  const singlePage = model.items.length <= 4
  const detailPages = singlePage
    ? [`<article class="quotation-document">${header()}${title}${meta}${table(model.items)}${summary}</article>`]
    : Array.from({ length: Math.ceil(model.items.length / 9) }, (_, pageIndex) => {
        const items = model.items.slice(pageIndex * 9, pageIndex * 9 + 9)
        return `<article class="quotation-document">${pageIndex === 0 ? `${header()}${title}${meta}` : `${header(true)}<div class="continuation">${escapeHtml(model.quotationNumber)} · Trang chi tiết ${pageIndex + 1}</div>`}${table(items)}<div class="page-note">Tiếp theo / Continued</div></article>`
      })
  if (!singlePage) detailPages.push(`<article class="quotation-document summary-page">${header(true)}${title}<div class="summary-reference"><b>Báo giá số:</b> ${escapeHtml(model.quotationNumber)} &nbsp; · &nbsp; <b>Khách hàng:</b> ${escapeHtml(model.customer.name)}</div>${summary}</article>`)

  return `<div class="quotation-render">
    <style>
      .quotation-render{display:flex;flex-direction:column;gap:20px;background:transparent}.quotation-document{width:1120px;min-height:794px;padding:26px 32px;background:#fff;color:#111827;font-family:Arial,sans-serif;font-size:11px;line-height:1.32;box-sizing:border-box;page-break-after:always}.quotation-document:last-child{page-break-after:auto}
      .quotation-document *{box-sizing:border-box}.quotation-document .company{display:grid;grid-template-columns:90px 1fr 305px;gap:14px;align-items:start;min-height:58px}.quotation-document .company.compact{min-height:48px;border-bottom:1px solid #cbd5e1;margin-bottom:12px;padding-bottom:8px}.quotation-document .logo{width:84px;height:56px;object-fit:contain}.quotation-document h1{margin:10px 0 9px;text-align:center;font-size:20px;color:#b91c1c;line-height:1.15}.quotation-document h2{margin:0;font-size:15px;color:#1d4ed8}.quotation-document .english{font-size:10px;font-weight:700;color:#475569}.quotation-document .meta{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;margin:7px 0 10px;padding:8px 10px;border:1px solid #94a3b8;font-size:10.5px}.quotation-document .meta b{display:inline-block;min-width:105px}.quotation-document table{width:100%;border-collapse:collapse;table-layout:fixed}.quotation-document th,.quotation-document td{border:1px solid #475569;padding:4px 3px;vertical-align:middle;overflow-wrap:anywhere}.quotation-document th{background:#dbeafe;text-align:center;font-size:9px;line-height:1.2}.quotation-document td{font-size:9.5px;min-height:27px}.quotation-document .center{text-align:center}.quotation-document .number{text-align:right;white-space:nowrap}.quotation-document .strong{font-weight:700}.quotation-document .totals{margin:9px 0 0 auto;width:390px}.quotation-document .total-row{display:flex;justify-content:space-between;padding:3px 8px;border-bottom:1px solid #cbd5e1;min-height:20px}.quotation-document .grand{font-size:14px;font-weight:700;color:#b91c1c;border-top:2px solid #b91c1c}.quotation-document .terms{margin-top:10px;border:1px solid #94a3b8;padding:7px 9px;font-size:10px}.quotation-document .signatures{display:grid;grid-template-columns:1fr 1fr;gap:110px;margin-top:16px;text-align:center;min-height:118px}.quotation-document .signatures>div{display:flex;flex-direction:column;justify-content:space-between;align-items:center}.quotation-document .signatures span{font-style:italic;font-weight:400;color:#64748b}.quotation-document .muted{color:#64748b}.quotation-document .continuation{text-align:right;margin:-5px 0 8px;font-size:10px;color:#64748b}.quotation-document .page-note{margin-top:10px;text-align:right;font-size:10px;color:#64748b}.quotation-document.summary-page .totals{margin-top:30px}.quotation-document.summary-page .terms{margin-top:20px}.quotation-document.summary-page .signatures{margin-top:34px;min-height:190px}.quotation-document .summary-reference{margin:14px 0 20px;border:1px solid #94a3b8;padding:9px 12px}
    </style>
    ${detailPages.join("")}
  </div>`
}

function quotationFileName(model: QuotationRenderModel, extension: string) {
  const base = (model.quotationNumber || model.quotationId || "quotation").replace(/[^a-z0-9_-]+/gi, "-")
  return `${base}.${extension}`
}

export async function exportQuotationExcel(model: QuotationRenderModel, fallbackLogoUrl = "") {
  const { default: ExcelJS } = await import("exceljs")
  const workbook = new ExcelJS.Workbook()
  workbook.creator = model.company.name
  workbook.created = new Date()
  const sheet = workbook.addWorksheet("Báo giá", { pageSetup: {
    orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },
  } })
  sheet.columns = [10, 22, 28, 24, 10, 9, 15, 18, 10, 15, 18, 22].map(width => ({ width }))
  const border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } as const
  const logo = model.company.logoUrl || fallbackLogoUrl
  if (logo) {
    try {
      const response = await fetch(logo)
      const imageId = workbook.addImage({ buffer: await response.arrayBuffer(), extension: "png" })
      sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 95, height: 58 } })
    } catch { /* A missing logo must not block a quotation export. */ }
  }
  sheet.mergeCells("B1:H1"); sheet.getCell("B1").value = model.company.name
  sheet.getCell("B1").font = { bold: true, size: 14, color: { argb: "FF1D4ED8" } }
  sheet.mergeCells("B2:H2"); sheet.getCell("B2").value = model.company.englishName
  sheet.mergeCells("B3:H3"); sheet.getCell("B3").value = model.company.address
  sheet.mergeCells("I1:L1"); sheet.getCell("I1").value = `Tài khoản: ${model.company.bankAccountName}`
  sheet.mergeCells("I2:L2"); sheet.getCell("I2").value = `Số TK: ${model.company.bankAccountNumber} · ${model.company.bankName}`
  sheet.mergeCells("I3:L3"); sheet.getCell("I3").value = model.company.bankBranch
  sheet.mergeCells("A5:L6"); sheet.getCell("A5").value = model.title
  sheet.getCell("A5").font = { bold: true, size: 18, color: { argb: "FFB91C1C" } }
  sheet.getCell("A5").alignment = { horizontal: "center", vertical: "middle" }
  const meta = [
    ["Khách hàng", model.customer.name, "Báo giá số", model.quotationNumber],
    ["Địa chỉ", model.customer.address, "Ngày", model.date],
    ["Điện thoại", model.customer.phone, "Hiệu lực đến", model.validUntil],
    ["Email", model.customer.email, "Nhân viên báo giá", model.salesperson],
    ["Dự án", model.project, "SĐT nhân viên", model.salespersonPhone],
  ]
  meta.forEach((values, index) => {
    const row = 7 + index
    sheet.getCell(row, 1).value = values[0]; sheet.mergeCells(row, 2, row, 6); sheet.getCell(row, 2).value = values[1]
    sheet.getCell(row, 7).value = values[2]; sheet.mergeCells(row, 8, row, 12); sheet.getCell(row, 8).value = values[3]
    sheet.getCell(row, 1).font = { bold: true }; sheet.getCell(row, 7).font = { bold: true }
  })
  const headerRow = sheet.addRow(["STT", "Hàng hóa đề xuất", "Hàng hóa cung cấp", "Quy cách / Nhãn hiệu", "Đơn vị", "KL", "Đơn giá", "Thành tiền trước thuế", "VAT (%)", "Tiền thuế", "Thành tiền sau thuế", "Ghi chú"])
  headerRow.height = 34
  headerRow.eachCell(cell => { cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } }; cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = border })
  model.items.forEach(item => {
    const row = sheet.addRow([item.index, item.proposedGoods, item.offeredGoods, item.specificationBrand, item.unit, item.quantity, item.unitPrice, item.subtotal, item.vatRate, item.vatAmount, item.total, item.note])
    row.height = 30
    row.eachCell((cell, index) => { cell.border = border; cell.alignment = { vertical: "middle", wrapText: true, horizontal: [1, 5].includes(index) ? "center" : index >= 6 && index <= 11 ? "right" : "left" }; if (index >= 7 && index <= 11 && index !== 9) cell.numFmt = "#,##0" })
  })
  sheet.addRow([])
  const summaries: [string, number][] = [["Cộng tiền hàng", model.totals.subtotal], ["Chiết khấu", model.totals.discount], ["Tiền trước VAT", model.totals.beforeVat], ["Tổng VAT", model.totals.vat], ["TỔNG THANH TOÁN", model.totals.grandTotal]]
  summaries.forEach(([label, value], index) => {
    const row = sheet.addRow([]); sheet.mergeCells(row.number, 8, row.number, 10); row.getCell(8).value = label; row.getCell(11).value = value; row.getCell(11).numFmt = "#,##0"; row.getCell(8).font = { bold: true }; row.getCell(11).font = { bold: true, color: { argb: index === summaries.length - 1 ? "FFB91C1C" : "FF111827" } }
  })
  const termsRow = sheet.addRow([`Điều khoản:\n• ${model.terms.includeShipping ? "Báo giá đã bao gồm" : "Báo giá chưa bao gồm"} chi phí vận chuyển.\n• ${model.terms.payment}\n• ${model.terms.delivery}\n• Báo giá có hiệu lực đến ${model.validUntil}.\n${model.terms.footerNotes}\n${model.terms.quotationNotes}`])
  sheet.mergeCells(termsRow.number, 1, termsRow.number, 12); termsRow.height = 82; termsRow.getCell(1).alignment = { wrapText: true, vertical: "top" }
  const signatureTitleRow = sheet.addRow([])
  sheet.mergeCells(signatureTitleRow.number, 1, signatureTitleRow.number, 6)
  sheet.mergeCells(signatureTitleRow.number, 7, signatureTitleRow.number, 12)
  signatureTitleRow.getCell(1).value = "ĐẠI DIỆN KHÁCH HÀNG"
  signatureTitleRow.getCell(7).value = "ĐẠI DIỆN CÔNG TY"
  signatureTitleRow.getCell(1).alignment = signatureTitleRow.getCell(7).alignment = { horizontal: "center" }
  signatureTitleRow.getCell(1).font = signatureTitleRow.getCell(7).font = { bold: true }
  const signatureSpaceRow = sheet.addRow([]); signatureSpaceRow.height = 86
  const signatureCaptionRow = sheet.addRow([])
  sheet.mergeCells(signatureCaptionRow.number, 1, signatureCaptionRow.number, 6)
  sheet.mergeCells(signatureCaptionRow.number, 7, signatureCaptionRow.number, 12)
  signatureCaptionRow.getCell(1).value = "(Ký, ghi rõ họ tên)"
  signatureCaptionRow.getCell(7).value = "(Ký, ghi rõ họ tên, đóng dấu)"
  signatureCaptionRow.getCell(1).alignment = signatureCaptionRow.getCell(7).alignment = { horizontal: "center" }
  signatureCaptionRow.getCell(1).font = signatureCaptionRow.getCell(7).font = { italic: true, color: { argb: "FF64748B" } }
  sheet.views = [{ state: "frozen", ySplit: 12 }]
  await saveExcelWorkbook(workbook, quotationFileName(model, "xlsx"))
}

export async function exportQuotationPdf(model: QuotationRenderModel, fallbackLogoUrl = "") {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")])
  const container = window.document.createElement("div")
  container.innerHTML = renderQuotationHtml(model, model.company.logoUrl || fallbackLogoUrl)
  container.style.position = "fixed"; container.style.left = "-12000px"; container.style.top = "0"
  window.document.body.appendChild(container)
  try {
    const pages = Array.from(container.querySelectorAll<HTMLElement>(".quotation-document"))
    if (!pages.length) throw new Error("Quotation preview did not produce any pages")
    const document = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" })
    const pageWidth = document.internal.pageSize.getWidth()
    const pageHeight = document.internal.pageSize.getHeight()
    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], { scale: 2, backgroundColor: "#ffffff", useCORS: true })
      if (index > 0) document.addPage()
      const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
      const imageWidth = canvas.width * scale
      const imageHeight = canvas.height * scale
      document.addImage(canvas, "PNG", (pageWidth - imageWidth) / 2, 0, imageWidth, imageHeight)
    }
    document.save(quotationFileName(model, "pdf"))
  } finally { container.remove() }
}
