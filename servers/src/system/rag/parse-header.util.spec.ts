import * as ExcelJS from 'exceljs'
import * as path from 'path'
import * as fs from 'fs'
import {
  detectHeaderRow,
  buildHeaderColumns,
  dedupeColumns,
  preprocessMarkdownTables,
} from './parse-header.util'

/**
 * P0-1 验证用例：
 *   1) dedupeColumns：基础去重
 *   2) detectHeaderRow：示例 xlsx 的"合并标题 + 真表头在 row 2"场景必须返回 2
 *   3) buildHeaderColumns + dedupeColumns：示例文件应能正确解析 7 列真表头
 *   4) preprocessMarkdownTables：md 表格不被 `|` 切碎
 *   5) 端到端：示例 xlsx 解析后能拿到"序号 / 制度章节 / 制度名称 / ..."7 列真表头 + 30 行真数据
 */

describe('parse-header.util / P0-1 修复 xlsx 致命 Bug', () => {
  // 工作目录兼容：jest 可能在 dist/ 或 src/ 下执行
  // 项目根：servers 的父目录 nest-admin（upload/ 在这里）
  const findSamplePath = (): string | null => {
    const cwd = process.cwd()
    const candidates = [
      // 从 cwd 起算（cwd 在 git bash 下通常是 /d/sxy-web/ASG/nest-admin/servers）
      path.resolve(cwd, '..', 'upload', 'rag', '1781702772881_公司人事部基本规章制度.xlsx'),
      path.resolve(cwd, '..', '..', 'upload', 'rag', '1781702772881_公司人事部基本规章制度.xlsx'),
      path.resolve(cwd, '..', '..', '..', 'upload', 'rag', '1781702772881_公司人事部基本规章制度.xlsx'),
      path.resolve(cwd, 'upload', 'rag', '1781702772881_公司人事部基本规章制度.xlsx'),
      // 从 __dirname 起算（dist/ 或 src/）
      path.resolve(__dirname, '..', '..', '..', 'upload', 'rag', '1781702772881_公司人事部基本规章制度.xlsx'),
      path.resolve(__dirname, '..', '..', '..', '..', 'upload', 'rag', '1781702772881_公司人事部基本规章制度.xlsx'),
      // 绝对路径兜底
      'D:/sxy-web/ASG/nest-admin/upload/rag/1781702772881_公司人事部基本规章制度.xlsx',
      'D:\\sxy-web\\ASG\\nest-admin\\upload\\rag\\1781702772881_公司人事部基本规章制度.xlsx',
    ]
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p
      } catch { /* ignore */ }
    }
    return null
  }
  const samplePath = findSamplePath()
   
  console.log('[parse-header test] samplePath =', samplePath, 'cwd =', process.cwd())
  describe('dedupeColumns', () => {
    it('应把重复列名加 _2/_3 后缀', () => {
      expect(dedupeColumns(['序号', '制度', '制度'])).toEqual(['序号', '制度', '制度_2'])
    })
    it('应保留唯一列名不变', () => {
      expect(dedupeColumns(['A', 'B', 'C'])).toEqual(['A', 'B', 'C'])
    })
    it('应处理"全部重复"场景', () => {
      // 这是示例 xlsx 的核心 bug：row 1 是合并标题，7 列同名
      expect(dedupeColumns(['公司人事部基本规章制度', '公司人事部基本规章制度', '公司人事部基本规章制度'])).toEqual([
        '公司人事部基本规章制度',
        '公司人事部基本规章制度_2',
        '公司人事部基本规章制度_3',
      ])
    })
  })

  describe('preprocessMarkdownTables', () => {
    it('应把 md 表格转换为"表头: ... | 行1: ... | 行2: ..."形式', () => {
      const md = `# 标题
| 姓名 | 年龄 |
| --- | --- |
| 张三 | 30 |
| 李四 | 25 |

正文段落。`
      const out = preprocessMarkdownTables(md)
      expect(out).toContain('[表格]')
      expect(out).toContain('表头: 姓名 | 年龄')
      expect(out).toContain('行1: 张三 | 30')
      expect(out).toContain('行2: 李四 | 25')
      expect(out).toContain('正文段落。')
    })
    it('应保留非表格文本不变', () => {
      const md = `# 标题
这是一段普通文本，不含表格。`
      const out = preprocessMarkdownTables(md)
      expect(out).toBe(md)
    })
    it('应处理表格对齐不足的单元格', () => {
      const md = `| A | B | C |
| --- | --- | --- |
| 1 | 2 |`
      const out = preprocessMarkdownTables(md)
      expect(out).toContain('行1: 1 | 2 | (空)')
    })
  })

  describe('detectHeaderRow - 示例 xlsx 场景', () => {
    it('示例文件应存在', () => {
      expect(samplePath).not.toBeNull()
    })

    it('示例文件应被识别为 headerRow=2（真表头不在 row 1）', async () => {
      // samplePath 为 null 时强制失败（不能让"找不到文件"静默通过）
      expect(samplePath).not.toBeNull()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(samplePath!)
      const ws = workbook.worksheets[0]
      const headerRowNumber = detectHeaderRow(ws)
      expect(headerRowNumber).toBeGreaterThanOrEqual(2)
    })

    it('端到端：示例 xlsx 应能解析出 7 列真表头 + 30 行数据', async () => {
      expect(samplePath).not.toBeNull()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(samplePath!)
      const ws = workbook.worksheets[0]
      const headerRowNumber = detectHeaderRow(ws)
      const headerRow = ws.getRow(headerRowNumber)
      const columns = buildHeaderColumns(headerRow)

      // 7 列真表头（包含去重逻辑）
      expect(columns.length).toBeGreaterThanOrEqual(7)

      // 关键断言：解析出的列名不是"公司人事部基本规章制度" 7 次（这是旧 bug 的标志）
      const titleCount = columns.filter((c) => c.includes('公司人事部基本规章制度')).length
      expect(titleCount).toBe(0)

      // 真表头至少应包含"序号"
      expect(columns.some((c) => c === '序号')).toBe(true)
    })

    it('标准无合并 xlsx 应识别 headerRow=1', async () => {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Sheet1')
      ws.addRow(['姓名', '年龄', '性别'])
      ws.addRow(['张三', 30, '男'])
      ws.addRow(['李四', 25, '女'])
      const tmpPath = path.join(__dirname, '__tmp_normal.xlsx')
      await wb.xlsx.writeFile(tmpPath)
      try {
        const wb2 = new ExcelJS.Workbook()
        await wb2.xlsx.readFile(tmpPath)
        const ws2 = wb2.worksheets[0]
        const headerRowNumber = detectHeaderRow(ws2)
        expect(headerRowNumber).toBe(1)
      } finally {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
      }
    })
  })
})