import * as ExcelJS from 'exceljs'

/**
 * Excel/CSV 智能表头检测工具
 *
 * 痛点：原 parseExcelRows 固定把第 1 行当 header，对"合并单元格标题 + 真表头在第 2 行"
 *       的 xlsx（如"公司人事部基本规章制度.xlsx"）会导致：
 *       - 合并单元格 value 被复制到所有列 → 7 个同名 col_N → rowObject 互相覆盖 → 语义崩塌
 *
 * 解决方案：
 *   - detectHeaderRow：扫描前 N 行，找出"有效列名比例 = 去重值数 / 列数"最高的行作为 header
 *   - isMergedStartRow：判断某行是否是合并单元格起始行（用作辅助信号）
 *   - buildHeaderColumns：从 header 行取 cells → dedupeColumns 去重 → 输出稳定列名
 *   - dedupeColumns：把重复列名加 _2, _3 后缀，避免对象 key 互相覆盖
 *   - preprocessMarkdownTables：把 Markdown 表格提前转为"表头/行1/行2..."自然语言结构，
 *     避免 RecursiveCharacterTextSplitter 把 `| col1 | col2 |` 切碎导致列名上下文丢失
 */

/** 表头扫描上限行数；超过 10 行的合并大标题视为异常输入 */
const MAX_HEADER_SCAN_ROWS = 10
/** 去重值数 / 列数 < 0.6 视为"非 header"（合并标题整行同名，比例约 1/列数） */
const VALID_HEADER_RATIO_THRESHOLD = 0.6

/**
 * 合并区段的结构化表示
 */
interface MergeRange {
  top: number
  left: number
  bottom: number
  right: number
  tl: string
}

/**
 * 解析 worksheet.model.merges 为结构化数组
 * - 兼容 ExcelJS 两种返回形态：字符串 `'A1:B2'` 或对象 `{top,left,bottom,right}`
 * @param worksheet ExcelJS worksheet 实例
 * @returns 结构化的合并区段数组
 */
function extractMerges(worksheet: ExcelJS.Worksheet): MergeRange[] {
  const merges: any = (worksheet as any).model?.merges ?? []
  const result: MergeRange[] = []
  for (const m of merges) {
    // ExcelJS model.merges 项可以是 'A1:B2' 字符串，也可以是 {top,left,bottom,right} 对象
    if (typeof m === 'string') {
      // 解析 'A1:B2'：拆分为 [A1, B2]，反查 worksheet.getCell
      const parts = m.split(':')
      if (parts.length !== 2) continue
      const [tlAddr, brAddr] = parts
      const tlCell: any = worksheet.getCell(tlAddr)
      const tlVal =
        tlCell && tlCell.value !== null && tlCell.value !== undefined
          ? String(tlCell.value)
          : ''
      const tlRow = tlCell?.row ?? 0
      const tlColNum = tlCell?.col ?? 0
      const bottomCell: any = worksheet.getCell(brAddr)
      result.push({
        top: tlRow,
        left: tlColNum,
        bottom: bottomCell?.row ?? tlRow,
        right: bottomCell?.col ?? tlColNum,
        tl: tlVal,
      })
    } else if (m && typeof m === 'object') {
      // 已是结构化对象
      const tlCell: any = worksheet.getCell(m.top, m.left)
      const tlVal =
        tlCell && tlCell.value !== null && tlCell.value !== undefined
          ? String(tlCell.value)
          : ''
      result.push({
        top: m.top,
        left: m.left,
        bottom: m.bottom,
        right: m.right,
        tl: tlVal,
      })
    }
  }
  return result
}

/**
 * 判断 rowNumber 是否为某合并区段的"起始行"
 * @param merges    已提取的合并区段数组
 * @param rowNumber 目标行号（1-based）
 * @returns 是否为某合并区段的起始行
 */
function isMergedStartRow(merges: MergeRange[], rowNumber: number): boolean {
  return merges.some((m) => m.top === rowNumber)
}

/**
 * 计算 rowNumber 行的"有效列名比例"
 * - 取该行所有 cells 的 value，去 trim 后收集非空且去重
 * - 比例 = 去重数 / 总列数（worksheet.columnCount 或 row.cellCount）
 * - 列名全相同（如合并标题）→ 比例 = 1/列数 → 极低
 * @param worksheet ExcelJS worksheet 实例
 * @param rowNumber 目标行号（1-based）
 * @returns 0..1 之间的有效列名比例
 */
function computeHeaderRatio(worksheet: ExcelJS.Worksheet, rowNumber: number): number {
  const row = worksheet.getRow(rowNumber)
  const totalCols = worksheet.columnCount || row.cellCount
  if (totalCols === 0) return 0

  const values: string[] = []
  for (let c = 1; c <= totalCols; c++) {
    const cell: any = row.getCell(c)
    const v = cell?.value
    if (v === null || v === undefined) continue
    const s = typeof v === 'string' ? v.trim() : String(v).trim()
    if (s) values.push(s)
  }
  const distinct = new Set(values).size
  return distinct / totalCols
}

/**
 * 核心：智能探测真表头行号（1-based）
 *
 * - 策略：
 *   1. 扫描前 MAX_HEADER_SCAN_ROWS 行
 *   2. 优先排除"合并单元格起始行"（这类行通常是大标题）
 *   3. 找首个"有效列名比例 ≥ 阈值"的行作为 header
 *   4. 兜底：返回第 1 行（旧行为，确保向后兼容）
 * @param worksheet ExcelJS worksheet 实例
 * @returns 1-based 表头行号
 */
export function detectHeaderRow(worksheet: ExcelJS.Worksheet): number {
  const totalRows = Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS)
  if (totalRows <= 0) return 1

  let merges: MergeRange[] = []
  try {
    merges = extractMerges(worksheet)
  } catch {
    merges = []
  }

  // 第一遍：优先跳过合并起始行，找 ratio ≥ 阈值的
  for (let r = 1; r <= totalRows; r++) {
    if (isMergedStartRow(merges, r)) continue
    const ratio = computeHeaderRatio(worksheet, r)
    if (ratio >= VALID_HEADER_RATIO_THRESHOLD) return r
  }

  // 第二遍：不跳过合并起始行（应对"表头本身是合并"的少见场景）
  let bestRow = 1
  let bestRatio = 0
  for (let r = 1; r <= totalRows; r++) {
    const ratio = computeHeaderRatio(worksheet, r)
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestRow = r
    }
  }
  return bestRow
}

/**
 * 把 header 行的 cells 转为字符串数组 + dedupeColumns 去重
 *
 * - 空 cell fallback `col_${c}`
 * - 重复列名加 `_2` `_3` 后缀
 * - 支持公式 cell（取 result）、富文本 cell（拼接 richText.text）
 * @param headerRow ExcelJS Row 实例
 * @returns 去重后的列名数组
 */
export function buildHeaderColumns(headerRow: ExcelJS.Row): string[] {
  const rawColumns: string[] = []
  for (let c = 1; c <= headerRow.cellCount; c++) {
    const cell: any = headerRow.getCell(c)
    const v = cell?.value
    let colName: string
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      colName = `col_${c}`
    } else if (typeof v === 'object' && v !== null && 'result' in v) {
      // 公式 cell 的 value 是 { formula, result }，表头用 result
      colName = String((v as any).result ?? '').trim() || `col_${c}`
    } else if (typeof v === 'object' && v !== null && 'richText' in v) {
      // 富文本 cell
      const rich = (v as any).richText
      if (Array.isArray(rich)) {
        colName = rich.map((p: any) => String(p.text ?? '')).join('').trim() || `col_${c}`
      } else {
        colName = `col_${c}`
      }
    } else {
      colName = String(v).trim() || `col_${c}`
    }
    rawColumns.push(colName)
  }
  return dedupeColumns(rawColumns)
}

/**
 * 列名去重：把 ['序号','制度','制度'] → ['序号','制度','制度_2']
 * - 防止 rowObject key 互相覆盖（这就是原 bug 的根因之一）
 * @param cols 原始列名数组
 * @returns 去重后的列名数组
 */
export function dedupeColumns(cols: string[]): string[] {
  const seen = new Map<string, number>()
  const out: string[] = []
  for (const c of cols) {
    const count = seen.get(c) ?? 0
    if (count === 0) {
      out.push(c)
    } else {
      out.push(`${c}_${count + 1}`)
    }
    seen.set(c, count + 1)
  }
  return out
}

/**
 * P0-2：Markdown 表格预处理
 *
 * - 问题：原解析走 RCTS 默认 separators（`\n\n → \n → 。 → ' '`），会把 `| col1 | col2 |` 切碎
 *   LLM 召回的 chunk 看到的是"列名 = = ="而不是完整表格行，结构信息全丢
 *
 * - 解决方案：
 *   1. 识别 markdown 表格（连续行符合 `|...|`）
 *   2. 找到 header 行 + 分隔行（|---|---|）+ 数据行
 *   3. 把每行数据行转成 "表头: 值1 | 值2 | ..." 形式（行级自然语言化）
 *   4. 替换回原位置（保留上下文）
 *
 * - 示例：
 *   输入:
 *     | 姓名 | 年龄 |
 *     | --- | --- |
 *     | 张三 | 30 |
 *     | 李四 | 25 |
 *
 *   输出:
 *     [表格]
 *     表头: 姓名 | 年龄
 *     行1: 张三 | 30
 *     行2: 李四 | 25
 * @param rawText 原始 md 文本
 * @returns 预处理后的文本（表格已被展开为自然语言段）
 */
export function preprocessMarkdownTables(rawText: string): string {
  if (!rawText.includes('|')) return rawText
  const lines = rawText.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // 检测表格起始：当前行含 | 且 下一行是分隔行 (|---|)
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const headerLine = line.trim()
      const headers = splitTableRow(headerLine)
      // 跳过分隔行
      let j = i + 2
      const dataLines: string[] = []
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        dataLines.push(lines[j].trim())
        j++
      }
      if (headers.length > 0 && dataLines.length > 0) {
        out.push('[表格]')
        out.push(`表头: ${headers.join(' | ')}`)
        dataLines.forEach((dl, idx) => {
          const cells = splitTableRow(dl)
          // 按表头顺序对齐；不足补 (空)，多余截断
          const aligned = headers.map((_, ci) => cells[ci] ?? '(空)').join(' | ')
          out.push(`行${idx + 1}: ${aligned}`)
        })
        i = j
        continue
      }
    }
    out.push(line)
    i++
  }
  return out.join('\n')
}

/**
 * 把单行 markdown 表格行拆成 cell 数组
 * - 去除首尾的 `|`
 * - 去除每个 cell 前后空白
 * @param line 形如 `| a | b | c |` 的字符串
 * @returns cell 字符串数组
 */
function splitTableRow(line: string): string[] {
  let s = line.trim()
  // 去除首尾 |
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}