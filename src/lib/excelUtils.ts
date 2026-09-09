export function sanitizeSpreadsheetCell(value: unknown) {
  if (typeof value !== "string") return value
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value
}

async function createWorkbook() {
  const { default: ExcelJS } = await import("exceljs")
  return new ExcelJS.Workbook()
}

export async function saveExcelWorkbook(workbook: any, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function exportRowsToExcel(
  rows: unknown[][],
  filename: string,
  sheetName = "Sheet1",
) {
  const workbook = await createWorkbook()
  const sheet = workbook.addWorksheet(sheetName)
  rows.forEach((row) => sheet.addRow(row.map(sanitizeSpreadsheetCell)))
  sheet.columns.forEach((column: any) => {
    column.width = 18
  })
  await saveExcelWorkbook(workbook, filename)
}

export async function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
) {
  const headers = Array.from(new Set(data.flatMap((row) => Object.keys(row))))
  await exportRowsToExcel(
    [headers, ...data.map((row) => headers.map((header) => row[header] ?? ""))],
    filename,
  )
}

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === "," && !quoted) {
      row.push(cell)
      cell = ""
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      row.push(cell)
      if (row.some((value) => value.trim() !== "")) rows.push(row)
      row = []
      cell = ""
    } else {
      cell += character
    }
  }
  row.push(cell)
  if (row.some((value) => value.trim() !== "")) rows.push(row)
  return rows
}

function cellValue(value: any): unknown {
  if (value == null) return ""
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== "object") return value
  if ("result" in value) return cellValue(value.result)
  if (Array.isArray(value.richText))
    return value.richText.map((part: any) => part.text ?? "").join("")
  if ("text" in value) return value.text
  return String(value)
}

function rowsToObjects(rows: unknown[][]) {
  const [headerRow = [], ...dataRows] = rows
  const headers = headerRow.map((value) =>
    String(value ?? "")
      .replace(/^\uFEFF/, "")
      .trim(),
  )
  if (!headers.some(Boolean))
    throw new Error("The import file has no header row.")
  return dataRows
    .filter((row) => row.some((value) => value !== "" && value != null))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? ""]),
      ),
    )
}

export async function importFromExcel(
  file: File,
): Promise<Record<string, unknown>[]> {
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension === "csv") {
    return rowsToObjects(parseCsvRows(await file.text()))
  }
  if (extension !== "xlsx") {
    throw new Error("Only .csv and .xlsx files are supported.")
  }

  const workbook = await createWorkbook()
  await workbook.xlsx.load((await file.arrayBuffer()) as any)
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error("The workbook has no worksheet.")
  const rows: unknown[][] = []
  for (let rowNumber = 1; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const values: unknown[] = []
    for (
      let columnNumber = 1;
      columnNumber <= sheet.actualColumnCount;
      columnNumber += 1
    ) {
      values.push(cellValue(row.getCell(columnNumber).value))
    }
    rows.push(values)
  }
  return rowsToObjects(rows)
}

export async function downloadTemplate(headers: string[], filename: string) {
  await exportRowsToExcel(
    [headers, headers.map(() => "")],
    `${filename}_Template`,
    "Template",
  )
}
