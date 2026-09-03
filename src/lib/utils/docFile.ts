// ==========================================================================
// Word / Excel 文档 → 纯文本(前端解析,不上传文件)
// --------------------------------------------------------------------------
// docx 用 mammoth 提取纯文本;xlsx/xls 用 SheetJS 读所有 sheet 转文本。
// 两个库均动态 import,仅在选到对应文件时加载,不进主包关键路径。
// ==========================================================================

const OFFICE_EXTS = [".docx", ".xlsx", ".xls"];

export function isSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}

/** 是否为受支持的 Office 文档(按扩展名 + MIME 判断) */
export function isOfficeDoc(file: File): boolean {
  const name = file.name.toLowerCase();
  if (OFFICE_EXTS.some((e) => name.endsWith(e))) return true;
  const t = file.type;
  return (
    t === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || // .docx
    t === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // .xlsx
    t === "application/vnd.ms-excel" // .xls
  );
}

function isDocx(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

/** .docx → 纯文本 */
async function docxToText(file: File): Promise<string> {
  const mammoth: any = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return (value ?? "").trim();
}

/** .xlsx/.xls → 纯文本(每个 sheet 标题 + CSV) */
async function xlsxToText(file: File): Promise<string> {
  const XLSX: any = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) parts.push(`【工作表:${name}】\n${csv.trim()}`);
  }
  return parts.join("\n\n").trim();
}

/**
 * 把选中的 Office 文件解析为一段合并文本。
 * 多文件按顺序拼接,段间用文件名分隔。
 * .doc 老格式不支持 → 抛出可读错误。
 */
export async function officeFilesToText(files: File[]): Promise<string> {
  const chunks: string[] = [];
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
      throw new Error(`不支持 .doc 老格式(${file.name}),请在 Word 中另存为 .docx 后重试。`);
    }
    let text = "";
    if (isDocx(file)) {
      text = await docxToText(file);
    } else {
      // 其余按 Excel 处理(.xlsx/.xls)
      text = await xlsxToText(file);
    }
    if (text) chunks.push(`—— 文件:${file.name} ——\n${text}`);
  }
  const merged = chunks.join("\n\n").trim();
  if (!merged) throw new Error("未能从文档中解析出文本(文档可能为空)。");
  return merged;
}
