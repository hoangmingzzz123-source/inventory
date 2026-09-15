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

const quotationColumns = [
  { label: "STT", width: "3%", excelWidth: 18 },
  { label: "Hàng hóa đề xuất", width: "12%", excelWidth: 22 },
  { label: "Hàng hóa cung cấp", width: "15%", excelWidth: 28 },
  { label: "Quy cách / Nhãn hiệu", width: "13%", excelWidth: 24 },
  { label: "Đơn vị", width: "5%", excelWidth: 10 },
  { label: "KL", width: "5%", excelWidth: 9 },
  { label: "Đơn giá", width: "8%", excelWidth: 18 },
  { label: "Thành tiền trước thuế", width: "11%", excelWidth: 18 },
  { label: "VAT (%)", width: "5%", excelWidth: 10 },
  { label: "Tiền thuế", width: "8%", excelWidth: 15 },
  { label: "Thành tiền sau thuế", width: "10%", excelWidth: 18 },
  { label: "Ghi chú", width: "5%", excelWidth: 22 },
] as const

const quotationSignatures = [
  { title: "ĐẠI DIỆN KHÁCH HÀNG", caption: "(Ký, ghi rõ họ tên)" },
  { title: "ĐẠI DIỆN CÔNG TY", caption: "(Ký, ghi rõ họ tên, đóng dấu)" },
] as const

function quotationMetaRows(model: QuotationRenderModel) {
  return [
    ["Khách hàng", model.customer.name, "Báo giá số", model.quotationNumber],
    ["Người liên hệ", model.customer.representative, "Ngày", model.date],
    ["Địa chỉ", model.customer.address, "Hiệu lực đến", model.validUntil],
    ["Điện thoại", model.customer.phone, "Nhân viên báo giá", model.salesperson],
    ["Email", model.customer.email, "SĐT nhân viên", model.salespersonPhone],
    ["Dự án", model.project, "MST", model.customer.taxCode],
  ] as const
}

function quotationCompanyDetails(model: QuotationRenderModel) {
  return {
    identity: [
      model.company.name,
      model.company.englishName,
      model.company.address,
      [model.company.email, model.company.phone].filter(Boolean).join(" · "),
    ],
    banking: [
      ["Tài khoản", model.company.bankAccountName],
      ["Số TK", model.company.bankAccountNumber],
      ["Ngân hàng", model.company.bankName],
      ["Chi nhánh", model.company.bankBranch],
    ],
  } as const
}

function quotationTermLines(model: QuotationRenderModel) {
  return [
    model.terms.includeShipping
      ? "Báo giá đã bao gồm chi phí vận chuyển."
      : "Báo giá chưa bao gồm chi phí vận chuyển.",
    model.terms.payment,
    model.terms.delivery,
    `Báo giá có hiệu lực đến ${model.validUntil}.`,
    model.terms.footerNotes,
    model.terms.quotationNotes ? `Ghi chú báo giá: ${model.terms.quotationNotes}` : "",
  ].filter(line => line.trim().length > 0)
}

export function renderQuotationHtml(model: QuotationRenderModel, logoUrl = "") {
  const companyDetails = quotationCompanyDetails(model)
  const renderItemRows = (items: QuotationRenderItem[]) => items.map(item => `<tr class="quotation-row">
    <td class="center"><div class="cell-value">${item.index}</div></td>
    <td><div class="cell-value">${escapeHtml(item.proposedGoods)}</div></td>
    <td><div class="cell-value">${escapeHtml(item.offeredGoods)}</div></td>
    <td><div class="cell-value">${escapeHtml(item.specificationBrand)}</div></td>
    <td class="center"><div class="cell-value">${escapeHtml(item.unit)}</div></td>
    <td class="number"><div class="cell-value">${item.quantity.toLocaleString("vi-VN")}</div></td>
    <td class="number"><div class="cell-value">${formatVnd(item.unitPrice)}</div></td>
    <td class="number"><div class="cell-value">${formatVnd(item.subtotal)}</div></td>
    <td class="number"><div class="cell-value">${item.vatRate ? `${item.vatRate}%` : "0%"}</div></td>
    <td class="number"><div class="cell-value">${formatVnd(item.vatAmount)}</div></td>
    <td class="number strong"><div class="cell-value">${formatVnd(item.total)}</div></td>
    <td><div class="cell-value">${escapeHtml(item.note)}</div></td>
  </tr>`).join("")
  const header = (compact = false) => `<header class="company${compact ? " compact" : ""}">
      <div>${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" />` : ""}</div>
      <div><h2>${escapeHtml(companyDetails.identity[0])}</h2><div class="english">${escapeHtml(companyDetails.identity[1])}</div><div>${escapeHtml(companyDetails.identity[2])}</div><div>${escapeHtml(companyDetails.identity[3])}</div></div>
      <div>${companyDetails.banking.map(([label, value]) => `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`).join("<br/>")}</div>
    </header>`
  const title = `<h1>${escapeHtml(model.title)}</h1>`
  const meta = `<section class="meta">${quotationMetaRows(model).map(([leftLabel, leftValue, rightLabel, rightValue]) =>
    `<div><b>${escapeHtml(leftLabel)}:</b> ${escapeHtml(leftValue)}</div><div><b>${escapeHtml(rightLabel)}:</b> ${escapeHtml(rightValue)}</div>`,
  ).join("")}</section>`
  const table = (items: QuotationRenderItem[]) => `<table><colgroup>${quotationColumns.map(column => `<col style="width:${column.width}"/>`).join("")}</colgroup>
      <thead><tr>${quotationColumns.map(column => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead>
      <tbody>${renderItemRows(items) || '<tr><td colspan="12" class="center muted">Chưa có hàng hóa</td></tr>'}</tbody>
    </table>`
  const summary = `<section class="totals">
      <div class="total-row"><span>Cộng tiền hàng</span><b>${formatVnd(model.totals.subtotal)}</b></div>
      <div class="total-row"><span>Chiết khấu</span><b>${formatVnd(model.totals.discount)}</b></div>
      <div class="total-row"><span>Tiền trước VAT</span><b>${formatVnd(model.totals.beforeVat)}</b></div>
      <div class="total-row"><span>Tổng VAT</span><b>${formatVnd(model.totals.vat)}</b></div>
      <div class="total-row grand"><span>TỔNG THANH TOÁN</span><span>${formatVnd(model.totals.grandTotal)}</span></div>
    </section>
    <section class="terms"><b>Điều khoản:</b><br/>${quotationTermLines(model).map(line => `• ${htmlLines(line)}`).join("<br/>")}</section>
    <section class="signatures">${quotationSignatures.map(signature => `<div><b>${escapeHtml(signature.title)}</b><span>${escapeHtml(signature.caption)}</span></div>`).join("")}</section>`

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
      .quotation-document .quotation-row td{padding:0 3px}.quotation-document .cell-value{overflow-wrap:anywhere}.quotation-document .center .cell-value{text-align:center}.quotation-document .number .cell-value{text-align:right;white-space:nowrap}
      .quotation-render{display:flex;flex-direction:column;gap:20px;background:transparent}.quotation-document{width:1120px;min-height:794px;padding:26px 32px;background:#fff;color:#111827;font-family:Arial,sans-serif;font-size:11px;line-height:1.32;box-sizing:border-box;page-break-after:always}.quotation-document:last-child{page-break-after:auto}
      .quotation-document *{box-sizing:border-box}.quotation-document .company{display:grid;grid-template-columns:90px 1fr 305px;gap:14px;align-items:start;min-height:58px}.quotation-document .company.compact{min-height:48px;border-bottom:1px solid #cbd5e1;margin-bottom:12px;padding-bottom:8px}.quotation-document .logo{width:84px;height:56px;object-fit:contain}.quotation-document h1{margin:10px 0 9px;text-align:center;font-size:20px;color:#b91c1c;line-height:1.15}.quotation-document h2{margin:0;font-size:15px;color:#1d4ed8}.quotation-document .english{font-size:10px;font-weight:700;color:#475569}.quotation-document .meta{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;margin:7px 0 10px;padding:8px 10px;border:1px solid #94a3b8;font-size:10.5px}.quotation-document .meta b{display:inline-block;min-width:105px}.quotation-document table{width:100%;border-collapse:collapse;table-layout:fixed}.quotation-document th,.quotation-document td{border:1px solid #475569;padding:4px 3px;vertical-align:middle;overflow-wrap:anywhere}.quotation-document th{background:#dbeafe;text-align:center;font-size:9px;line-height:1.2}.quotation-document .quotation-row{height:27px}.quotation-document .quotation-row td{height:27px;vertical-align:middle;font-size:9.5px;line-height:1.32}.quotation-document .center{text-align:center}.quotation-document .number{text-align:right;white-space:nowrap}.quotation-document .strong{font-weight:700}.quotation-document .totals{margin:9px 0 0 auto;width:390px}.quotation-document .total-row{display:flex;justify-content:space-between;padding:3px 8px;border-bottom:1px solid #cbd5e1;min-height:20px}.quotation-document .grand{font-size:14px;font-weight:700;color:#b91c1c;border-top:2px solid #b91c1c}.quotation-document .terms{margin-top:10px;border:1px solid #94a3b8;padding:7px 9px;font-size:10px}.quotation-document .signatures{display:grid;grid-template-columns:1fr 1fr;gap:110px;margin-top:16px;text-align:center;min-height:118px}.quotation-document .signatures>div{display:flex;flex-direction:column;justify-content:space-between;align-items:center}.quotation-document .signatures span{font-style:italic;font-weight:400;color:#64748b}.quotation-document .muted{color:#64748b}.quotation-document .continuation{text-align:right;margin:-5px 0 8px;font-size:10px;color:#64748b}.quotation-document .page-note{margin-top:10px;text-align:right;font-size:10px;color:#64748b}.quotation-document.summary-page .totals{margin-top:30px}.quotation-document.summary-page .terms{margin-top:20px}.quotation-document.summary-page .signatures{margin-top:34px;min-height:190px}.quotation-document .summary-reference{margin:14px 0 20px;border:1px solid #94a3b8;padding:9px 12px}
      .quotation-document {display:flex}
      .quotation-document {flex-direction:column}
      .quotation-document {justify-content:center}
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
  sheet.columns = quotationColumns.map(column => ({ width: column.excelWidth }))
  const border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } as const
  const companyDetails = quotationCompanyDetails(model)
  const logo = model.company.logoUrl || fallbackLogoUrl
  if (logo) {
    try {
      const response = await fetch(logo)
      const imageId = workbook.addImage({ buffer: await response.arrayBuffer(), extension: "png" })
      sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 95, height: 58 } })
    } catch { /* A missing logo must not block a quotation export. */ }
  }
  sheet.mergeCells("B1:H1"); sheet.getCell("B1").value = companyDetails.identity[0]
  sheet.getCell("B1").font = { bold: true, size: 14, color: { argb: "FF1D4ED8" } }
  sheet.mergeCells("B2:H2"); sheet.getCell("B2").value = companyDetails.identity[1]
  sheet.mergeCells("B3:H3"); sheet.getCell("B3").value = companyDetails.identity[2]
  sheet.mergeCells("B4:H4"); sheet.getCell("B4").value = companyDetails.identity[3]
  companyDetails.banking.forEach(([label, value], index) => {
    const row = index + 1
    sheet.mergeCells(row, 9, row, 12)
    sheet.getCell(row, 9).value = `${label}: ${value}`
  })
  sheet.mergeCells("A6:L7"); sheet.getCell("A6").value = model.title
  sheet.getCell("A6").font = { bold: true, size: 18, color: { argb: "FFB91C1C" } }
  sheet.getCell("A6").alignment = { horizontal: "center", vertical: "middle" }
  const meta = quotationMetaRows(model)
  meta.forEach((values, index) => {
    const row = 8 + index
    sheet.getCell(row, 1).value = values[0]; sheet.mergeCells(row, 2, row, 6); sheet.getCell(row, 2).value = values[1]
    sheet.getCell(row, 7).value = values[2]; sheet.mergeCells(row, 8, row, 12); sheet.getCell(row, 8).value = values[3]
    sheet.getCell(row, 1).font = { bold: true }; sheet.getCell(row, 7).font = { bold: true }
  })
  const headerRow = sheet.addRow(quotationColumns.map(column => column.label))
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
  const termsRow = sheet.addRow([`Điều khoản:\n${quotationTermLines(model).map(line => `• ${line}`).join("\n")}`])
  sheet.mergeCells(termsRow.number, 1, termsRow.number, 12); termsRow.height = Math.max(82, 18 + quotationTermLines(model).length * 15); termsRow.getCell(1).alignment = { wrapText: true, vertical: "top" }
  const signatureTitleRow = sheet.addRow([])
  sheet.mergeCells(signatureTitleRow.number, 1, signatureTitleRow.number, 6)
  sheet.mergeCells(signatureTitleRow.number, 7, signatureTitleRow.number, 12)
  signatureTitleRow.getCell(1).value = quotationSignatures[0].title
  signatureTitleRow.getCell(7).value = quotationSignatures[1].title
  signatureTitleRow.getCell(1).alignment = signatureTitleRow.getCell(7).alignment = { horizontal: "center" }
  signatureTitleRow.getCell(1).font = signatureTitleRow.getCell(7).font = { bold: true }
  const signatureSpaceRow = sheet.addRow([]); signatureSpaceRow.height = 86
  const signatureCaptionRow = sheet.addRow([])
  sheet.mergeCells(signatureCaptionRow.number, 1, signatureCaptionRow.number, 6)
  sheet.mergeCells(signatureCaptionRow.number, 7, signatureCaptionRow.number, 12)
  signatureCaptionRow.getCell(1).value = quotationSignatures[0].caption
  signatureCaptionRow.getCell(7).value = quotationSignatures[1].caption
  signatureCaptionRow.getCell(1).alignment = signatureCaptionRow.getCell(7).alignment = { horizontal: "center" }
  signatureCaptionRow.getCell(1).font = signatureCaptionRow.getCell(7).font = { italic: true, color: { argb: "FF64748B" } }
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }]
  await saveExcelWorkbook(workbook, quotationFileName(model, "xlsx"))
}

export async function exportQuotationPdf(model: QuotationRenderModel, fallbackLogoUrl = "") {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")])
  const container = window.document.createElement("div")
  container.innerHTML = renderQuotationHtml(model, model.company.logoUrl || fallbackLogoUrl)
  const exportStyle = window.document.createElement("style")
  exportStyle.textContent = `.quotation-export-canvas .quotation-row td{position:relative}.quotation-export-canvas .quotation-row .cell-value{position:absolute;left:3px;right:3px;min-height:0;height:auto}`
  container.classList.add("quotation-export-canvas")
  container.appendChild(exportStyle)
  container.style.position = "fixed"; container.style.left = "-12000px"; container.style.top = "0"
  window.document.body.appendChild(container)
  try {
    const pages = Array.from(container.querySelectorAll<HTMLElement>(".quotation-document"))
    if (!pages.length) throw new Error("Quotation preview did not produce any pages")
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
    container.querySelectorAll<HTMLTableCellElement>(".quotation-row td").forEach(cell => {
      const value = cell.querySelector<HTMLElement>(".cell-value")
      if (!value) return
      const cellHeight = cell.getBoundingClientRect().height
      const valueHeight = value.getBoundingClientRect().height
      const fontSize = Number.parseFloat(window.getComputedStyle(value).fontSize)
      if (valueHeight <= fontSize * 1.6) {
        value.style.top = "0px"
        value.style.lineHeight = `${cellHeight}px`
      } else {
        value.style.top = `${Math.max(0, (cellHeight - valueHeight) / 2)}px`
      }
    })
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
