import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, In } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import * as path from 'path'

import { ChatOpenAI } from '@langchain/openai'
import { Document } from '@langchain/core/documents'
import { Embeddings, type EmbeddingsParams } from '@langchain/core/embeddings'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { QdrantVectorStore } from '@langchain/qdrant'
import { PDFParse } from 'pdf-parse'
import * as mammoth from 'mammoth'
import * as ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'

import { RagFileEntity, RagTrackEnum, VectorStatusEnum } from './rag-file.entity'
import { RagSessionEntity } from './rag-session.entity'
import { RagMessageEntity } from './rag-message.entity'
import { ResultData } from '../../common/utils/result'
import { RAG_UPLOAD_DIR } from './rag-upload.util'

/**
 * 【P1-2 / P1-3】引用源条目
 * - ragTrack='vector'（长文本）：chunkIndex 是文本切片号
 * - ragTrack='sql'（结构化表格）：chunkIndex 是 row 聚合块号，rowIndices/columns/sheetName 标记行级来源
 */
export interface CitationDto {
  fileId: number
  fileName: string
  chunkIndex: number
  content: string
  score: number | null
  // 【P1-3】SQL 轨道扩展字段
  ragTrack?: 'vector' | 'sql' | null
  sheetName?: string | null
  rowIndices?: number[] | null
  columns?: string[] | null
}

/**
 * 【P1-2】历史消息（用于多轮对话上下文拼装）
 */
interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 【P1-3】MiniMax 兼容协议的 Embeddings 适配器
 *
 * 为什么不直接用 OpenAIEmbeddings：
 *   1) MiniMax（api.minimaxi.com）的 /v1/embeddings 接口字段名是 MiniMax 私有的：
 *      - 请求体用 `texts: [...]` + `type: 'db'|'query'`，不接受 OpenAI 标准的 `input: [...]`
 *      - 响应体用 `vectors: number[][]`，不是 OpenAI 标准的 `data: [...]`
 *   2) 直接套 OpenAIEmbeddings 会让服务端返回 200 + 业务错误 `{vectors: null, base_resp: {status_code: 2013, ...}}`，
 *      OpenAI SDK 把这种"业务错"解析成 `data: undefined`，再被 langchain 内部
 *      `batchResponse[j].embedding` 访问 → 抛 `Cannot read properties of undefined (reading '0')`。
 *
 * 这里直接 fetch 走 MiniMax 私有协议，避开 OpenAI SDK 的字段假设。
 * model 名字从 `ai.llm.modelName` yml 里读（推荐用 'embo-01'）。
 */
interface MiniMaxEmbeddingsParams extends EmbeddingsParams {
  apiKey: string
  baseURL: string
  modelName: string
  batchSize?: number
}

class MiniMaxEmbeddings extends Embeddings {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly modelName: string
  private readonly batchSize: number

  constructor(params: MiniMaxEmbeddingsParams) {
    super(params)
    this.apiKey = params.apiKey
    this.baseURL = params.baseURL.replace(/\/$/, '')
    this.modelName = params.modelName
    this.batchSize = params.batchSize ?? 16
  }

  private async call(texts: string[], type: 'db' | 'query'): Promise<number[][]> {
    if (texts.length === 0) return []
    const r = await fetch(`${this.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ model: this.modelName, type, texts })
    })
    if (!r.ok) {
      throw new Error(`[MiniMaxEmbeddings] HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)
    }
    const body: any = await r.json()
    if (body?.base_resp?.status_code !== 0 || !Array.isArray(body?.vectors)) {
      throw new Error(
        `[MiniMaxEmbeddings] 业务错误 status_code=${body?.base_resp?.status_code} msg=${body?.base_resp?.status_msg} raw=${JSON.stringify(body).slice(0, 300)}`,
      )
    }
    return body.vectors as number[][]
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const out: number[][] = []
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize)
      const vecs = await this.call(batch, 'db')
      out.push(...vecs)
    }
    return out
  }

  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.call([text], 'query')
    return v
  }
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name)
  private readonly llm: ChatOpenAI
  private readonly embeddings: MiniMaxEmbeddings
  private readonly qdrantUrl: string
  private readonly collectionName: string

  constructor(
    @InjectRepository(RagFileEntity)
    private readonly ragFileRepository: Repository<RagFileEntity>,
    @InjectRepository(RagSessionEntity)
    private readonly ragSessionRepository: Repository<RagSessionEntity>,
    @InjectRepository(RagMessageEntity)
    private readonly ragMessageRepository: Repository<RagMessageEntity>,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('ai.llm.apiKey')
    const baseURL = this.configService.get<string>('ai.llm.baseURL')
    const chatModel = this.configService.get<string>('ai.llm.chatModel') || 'MiniMax-Text-01'
    const embeddingModel = this.configService.get<string>('ai.llm.embeddingModel') || 'embo-01'
    this.qdrantUrl = this.configService.get<string>('ai.qdrant.url')
    this.collectionName = this.configService.get<string>('ai.qdrant.collectionName')

    this.llm = new ChatOpenAI({ apiKey, configuration: { baseURL }, modelName: chatModel, temperature: 0.2, streaming: true })
    // 🔧 用 MiniMax 兼容协议专用适配器（见上方 MiniMaxEmbeddings 类注释）
    this.embeddings = new MiniMaxEmbeddings({ apiKey, baseURL, modelName: embeddingModel })
  }

  // ============================================================================
  // 📂 知识库语料 CRUD
  // ============================================================================

  async getKnowledgeFileList(parentId: number): Promise<RagFileEntity[]> {
    return await this.ragFileRepository.find({
      where: { parentId },
      order: { isFolder: 'DESC', createdAt: 'DESC' },
    })
  }

  /**
   * 【P1-4】资产 ID 列表（可能含文件夹 + 文件）→ 纯文件 ID 列表（递归展开文件夹）
   *
   * 场景：dashboard 树形选择器允许用户勾选"外层文件夹"代表"该文件夹下所有文件"。
   * Qdrant 检索只认 metadata.fileId，所以后端在 similaritySearch 前必须把
   * 混合的"文件 id + 文件夹 id"列表展开成纯文件 id。
   *
   * 算法：BFS 一次性查所有直系子节点；目录深度通常 ≤ 3 层，最坏 O(N)。
   * 防御：visited Set 防止 folder 间循环引用导致死循环。
   */
  async expandAssetIdsToFileIds(assetIds: number[]): Promise<number[]> {
    if (!Array.isArray(assetIds) || assetIds.length === 0) return []

    // 第一步：先分桶（哪些是文件夹，哪些是文件）
    const items = await this.ragFileRepository.find({
      where: { id: In(assetIds) },
      select: ['id', 'isFolder'],
    })
    const fileIdSet = new Set<number>()
    const folderIds: number[] = []
    for (const item of items) {
      if (item.isFolder === 1) folderIds.push(item.id)
      else fileIdSet.add(item.id)
    }
    if (folderIds.length === 0) return Array.from(fileIdSet)

    // 第二步：BFS 展开所有文件夹的子孙文件
    const visited = new Set<number>()
    const queue: number[] = [...folderIds]
    while (queue.length > 0) {
      const currentId = queue.shift()!
      if (visited.has(currentId)) continue
      visited.add(currentId)
      const children = await this.ragFileRepository.find({
        where: { parentId: currentId },
        select: ['id', 'isFolder'],
      })
      for (const c of children) {
        if (c.isFolder === 1) queue.push(c.id)
        else fileIdSet.add(c.id)
      }
    }
    return Array.from(fileIdSet)
  }

  async createFolder(fileName: string, parentId: number): Promise<RagFileEntity> {
    const folder = this.ragFileRepository.create({
      fileName: fileName,
      parentId: parentId,
      isFolder: 1,
      vectorStatus: VectorStatusEnum.SUCCESS,
      ragTrack: RagTrackEnum.VECTOR,
      size: 0,
    })
    return await this.ragFileRepository.save(folder)
  }

  /**
   * multer 2.x 给的 file.originalname 永远是 latin1 字符串（不论是否装 iconv-lite），
   * 这里独立做一次 latin1→utf8 反向解码，把 "å¬å¸..." 还原成 "公司人事部..."。
   * controller 那边已经修过一次磁盘文件名 (file.filename)，但 originalname 是只读属性，
   * service 必须自己再修一次才能保证数据库存的 fileName 是正确中文。
   */
  private decodeMojibakeName(raw: string): string {
    try {
      return Buffer.from(raw, 'latin1').toString('utf8')
    } catch {
      return raw
    }
  }

  /**
   * 注册一条物理文件资产
   * @param file       multer 解析后的文件（含 buffer/filename/path）
   * @param parentId   父目录 id（0 = 根）
   * @param serveRoot  Express static 暴露的虚拟路径前缀，如 '/static'
   * @param fileDomain 文件服务域名，如 'http://localhost:8081'
   */
  async registerPhysicalFile(
    file: Express.Multer.File,
    parentId: number,
    serveRoot?: string,
    fileDomain?: string,
  ): Promise<RagFileEntity> {
    // 🔧 关键：必须对 originalname 独立做 latin1→utf8 反向解码，否则存到 DB 的 fileName 是乱码
    const originalName = this.decodeMojibakeName(file.originalname)
    const ext = path.extname(originalName).toLowerCase()
    let track = RagTrackEnum.VECTOR

    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      track = RagTrackEnum.SQL
    }

    // 物理磁盘上由 multer diskStorage 写出的最终文件名（已含时间戳前缀 + 解码后的中文）
    // 真实可访问 URL：分两种情况拼接
    //   - fileDomain 非空：${fileDomain}${serveRoot}/rag/${diskFilename}，如 http://localhost:8081/static/rag/xxx
    //   - fileDomain 为空：${serveRoot}/rag/${diskFilename}，前端拼域名访问
    const diskFilename = file.filename || `${Date.now()}_${originalName}`
    const root = fileDomain ? `${fileDomain.replace(/\/$/, '')}${serveRoot || ''}` : `${serveRoot || ''}`
    const fileUrl = `${root}/rag/${diskFilename}`

    const fileEntity = this.ragFileRepository.create({
      fileName: originalName,
      parentId: parentId,
      isFolder: 0,
      fileUrl,
      size: file.size,
      fileType: ext,
      ragTrack: track,
      vectorStatus: VectorStatusEnum.PROCESSING,
    })

    return await this.ragFileRepository.save(fileEntity)
  }

  /**
   * 从磁盘读文件 buffer（用于 diskStorage 上传后的异步 ETL 管道）
   */
  private async readFileFromDisk(filePath: string): Promise<Buffer> {
    const fs = await import('fs')
    return await fs.promises.readFile(filePath)
  }

  /**
   * 异步 ETL 管道
   * @param filePath     multer diskStorage 写出的物理文件绝对路径
   * @param fileId       数据库中的文件 id
   * @param originalName 原始文件名（用于在 metadata 保留）
   */
  async asyncProcessEtlPipeline(filePath: string, fileId: number, originalName: string): Promise<void> {
    try {
      const record = await this.ragFileRepository.findOneBy({ id: fileId })
      if (!record) return

      // 🔧 关键：multer 给的 originalName 是 latin1 字符串，必须独立做一次 latin1→utf8 解码，
      // 否则 Qdrant metadata.fileName（以及后续任何按文件名做的引用/检索）会全是乱码。
      const safeOriginalName = this.decodeMojibakeName(originalName)

      // 从磁盘读 buffer 再交给解析器（不依赖 multer 的内存 buffer）
      const file: Express.Multer.File = {
        path: filePath,
        originalname: safeOriginalName,
        buffer: await this.readFileFromDisk(filePath),
        size: 0,
      } as any
      // size 用 stat 补全
      try {
        const stat = await import('fs').then((m) => m.promises.stat(filePath))
        ;(file as any).size = stat.size
      } catch {
        /* ignore */
      }

      if (record.ragTrack === RagTrackEnum.SQL) {
        await this.parseStructuredToVectorStore(file, fileId, safeOriginalName)
      } else {
        await this.parseDocumentToVectorStore(file, fileId)
      }

      await this.ragFileRepository.update(fileId, { vectorStatus: VectorStatusEnum.SUCCESS })
    } catch (error: any) {
      this.logger.error(`[RAG ETL 异步管道崩溃] FILE_ID: ${fileId}\n${error?.stack || error}`)
      // 把堆栈首行也存到 errorMessage，方便页面直接看到崩溃位置
      const stackFirstLine =
        (error?.stack || '').split('\n').slice(0, 3).join(' | ').slice(0, 500) || ''
      const msg = error instanceof Error ? error.message : '未知切片崩溃异常'
      await this.ragFileRepository.update(fileId, {
        vectorStatus: VectorStatusEnum.FAILED,
        errorMessage: stackFirstLine ? `${msg} | ${stackFirstLine}` : msg,
      })
    }
  }

  /**
   * 🔧 确保 Qdrant collection 存在且向量维度匹配当前 embedding 模型。
   * - collection 不存在：等 fromDocuments 内部自动建（dim 由第一次插入的向量决定）
   * - collection 存在但 dim 不匹配：DELETE 重建（兜底，避免历史脏数据 / 旧 model 残留导致 dim 冲突）
   * - dim 匹配：不动
   *
   * 实际生产建议加一个 "schema migration" 步骤，但当前项目还在 P1 阶段，删重建成本最低。
   */
  private async ensureQdrantCollection(expectedDim: number): Promise<void> {
    const url = `${this.qdrantUrl.replace(/\/$/, '')}/collections/${this.collectionName}`
    const r = await fetch(url)
    if (r.status === 404) {
      this.logger.log(`[Qdrant] collection ${this.collectionName} 不存在，将在首次写入时自动创建 (dim=${expectedDim})`)
      return
    }
    if (!r.ok) {
      throw new Error(`[Qdrant] 查询 collection 失败: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
    }
    const info: any = await r.json()
    const currentDim: number | undefined = info?.result?.config?.params?.vectors?.size
    if (currentDim === expectedDim) {
      this.logger.log(`[Qdrant] collection ${this.collectionName} 维度 OK (dim=${currentDim})`)
      return
    }
    // dim 不匹配 → 删重建
    this.logger.warn(
      `[Qdrant] collection ${this.collectionName} 维度不匹配 (existing=${currentDim}, expected=${expectedDim})，DELETE 重建`,
    )
    const del = await fetch(url, { method: 'DELETE' })
    if (!del.ok && del.status !== 404) {
      throw new Error(`[Qdrant] 删 collection 失败: HTTP ${del.status} ${(await del.text()).slice(0, 200)}`)
    }
  }

  private async parseDocumentToVectorStore(file: Express.Multer.File, fileId: number): Promise<void> {
    let rawText = ''
    const ext = path.extname(file.originalname).toLowerCase()

    if (ext === '.txt' || ext === '.md') {
      rawText = file.buffer.toString('utf-8')
    } else if (ext === '.pdf') {
      const pdfParser = new PDFParse({ data: file.buffer })
      const pdfData = await pdfParser.getText()
      rawText = pdfData.text
    } else if (ext === '.docx') {
      const docxData = await mammoth.extractRawText({ buffer: file.buffer })
      rawText = docxData.value
    } else {
      throw new Error(`暂不支持该文件格式: ${ext}`)
    }

    if (!rawText.trim()) throw new Error('语料解析为空')

    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 600, chunkOverlap: 100 })
    const chunks = await splitter.splitText(rawText)
    // ⚠️ file.originalname 已经被 asyncProcessEtlPipeline 在上游做过 latin1→utf8 解码，
    // 这里不要再解！直接用 file.originalname，否则会被"二次解码"重新打回乱码。
    // 用户报告过的乱码现象 l�����,��6�.xlsx 就是这行 double-decode 造成的。
    const documents = chunks.map((chunkText, index) => {
      return new Document({
        pageContent: chunkText,
        metadata: {
          fileId: fileId,
          fileName: file.originalname,
          chunkIndex: index,
        },
      })
    })

    // 🔧 先用一个 dummy 文本探测当前 embedding 模型的真实维度（1536 for embo-01）
    const probeVec = await this.embeddings.embedQuery('__dim_probe__')
    await this.ensureQdrantCollection(probeVec.length)

    await QdrantVectorStore.fromDocuments(documents, this.embeddings, {
      url: this.qdrantUrl,
      collectionName: this.collectionName,
    })
  }

  // ============================================================================
  // 📊【P1-3】SQL 轨道：结构化表格 (Excel/CSV) → 行级向量化
  // ============================================================================

  /**
   * 行级文本化模板：
   * 把一行 Excel/CSV 数据序列化成"自然语言友好"的描述。
   * - 例：{ 部门: '研发', 人数: 42, 月份: '2025-03' }
   *   → "部门: 研发; 人数: 42; 月份: 2025-03"
   *
   * 关键：ExcelJS 对 Date 单元格返回 `Date` 对象，String() 会输出
   *   "Sat Mar 15 2025 08:00:00 GMT+0800 (中国标准时间)"，LLM 检索"2025年3月"根本匹配不到。
   * 这里统一转成 `YYYY-MM-DD`（带时间的转成 `YYYY-MM-DD HH:mm`）。
   * 对 Excel 数字时间戳（1899-12-30 起的天数）也做识别。
   *
   * 跳过的内容：
   *   - 空值（null / undefined / 空字符串 / 空白）
   *   - 列名缺失（空标题自动 fallback col_N）
   */
  private serializeRowAsText(row: Record<string, unknown>): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) continue
      if (typeof value === 'string' && value.trim() === '') continue
      // ⚠️ Date / Excel 数字时间戳 → YYYY-MM-DD，否则 LLM 检索日期相关问题会全 miss
      parts.push(`${key}: ${this.stringifyCellValue(value)}`)
    }
    return parts.join('; ')
  }

  /**
   * 单个单元格值 → 字符串。
   * 处理顺序：Date 对象 → 数字（带 Excel 时间戳识别） → 富文本 → 其他
   */
  private stringifyCellValue(value: unknown): string {
    if (value instanceof Date) {
      return this.formatDate(value)
    }
    if (typeof value === 'number' && this.looksLikeExcelDateSerial(value)) {
      // Excel 时间戳：1900-01-01 起的天数（实际偏移 1899-12-30，含 1900 闰年 bug）
      const ms = (value - 25569) * 86400 * 1000 // 25569 = 1970-01-01 的 Excel 序列号
      const d = new Date(ms)
      if (!isNaN(d.getTime())) return this.formatDate(d)
    }
    if (typeof value === 'object' && value !== null) {
      // 富文本 { richText: [{ text, font? }, ...] }
      const rich = (value as any).richText
      if (Array.isArray(rich)) {
        return rich.map((p: any) => String(p.text ?? '')).join('')
      }
      // 公式 { formula, result } —— 已在外层 .result 提取，这里兜底
      if ('result' in (value as any)) {
        return this.stringifyCellValue((value as any).result)
      }
    }
    return String(value)
  }

  /**
   * Excel 时间戳范围：约 1（1900-01-01）到 100000+（2173 年以后）
   * 排除明显不是日期的小整数（如 1-31 可能被误识为日期）
   * 策略：只在数字 ≥ 10000（约 1927 年）时认为是日期
   */
  private looksLikeExcelDateSerial(n: number): boolean {
    return Number.isFinite(n) && n >= 10000 && n < 200000
  }

  /**
   * Date → "YYYY-MM-DD" 或 "YYYY-MM-DD HH:mm"（带非零时间）
   */
  private formatDate(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0')
    const y = d.getFullYear()
    const m = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hh = pad(d.getHours())
    const mm = pad(d.getMinutes())
    // 0 点整不带时间，避免噪音
    if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
      return `${y}-${m}-${day}`
    }
    return `${y}-${m}-${day} ${hh}:${mm}`
  }

  /**
   * 解析 Excel（多 sheet）→ 行级 Document[]
   * 走 ExcelJS（流式 + 保留单元格类型 + 多 sheet 友好）
   */
  private async parseExcelRows(
    file: Express.Multer.File,
  ): Promise<{ sheetName: string; columns: string[]; rowTexts: string[] }[]> {
    const workbook = new ExcelJS.Workbook()
    // multer 的 buffer 是 Buffer<ArrayBufferLike>，ExcelJS 期望 Node 旧版 Buffer，转 any 绕过 TS 5.7+ 泛型差异
    await workbook.xlsx.load(file.buffer as any)
    const result: { sheetName: string; columns: string[]; rowTexts: string[] }[] = []

    workbook.eachSheet((worksheet) => {
      const sheetName = worksheet.name || 'Sheet'
      // ExcelJS 第 1 行默认当表头；空 sheet 直接跳过
      if (worksheet.rowCount < 2) return

      // 取第 1 行做 header
      const headerRow = worksheet.getRow(1)
      const rawColumns: string[] = []
      for (let c = 1; c <= headerRow.cellCount; c++) {
        const cell = headerRow.getCell(c)
        const v = cell.value
        let colName: string
        if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
          colName = `col_${c}`
        } else {
          colName = String(v).trim()
        }
        rawColumns.push(colName)
      }

      // 遍历 data row（第 2 行起）
      const rowTexts: string[] = []
      for (let r = 2; r <= worksheet.rowCount; r++) {
        const dataRow = worksheet.getRow(r)
        const obj: Record<string, unknown> = {}
        let hasAnyValue = false
        for (let c = 1; c <= rawColumns.length; c++) {
          const cell = dataRow.getCell(c)
          let v: unknown = cell.value
          // ExcelJS 对 formula 单元格返回 { formula, result }，解出 result
          if (v && typeof v === 'object' && 'result' in (v as any)) {
            v = (v as any).result
          }
          // 跳过空 cell 保持稀疏行
          if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
            obj[rawColumns[c - 1]] = null
          } else {
            obj[rawColumns[c - 1]] = v
            hasAnyValue = true
          }
        }
        if (!hasAnyValue) continue
        const text = this.serializeRowAsText(obj)
        if (text) rowTexts.push(text)
      }

      if (rowTexts.length > 0) {
        result.push({ sheetName, columns: rawColumns, rowTexts })
      }
    })

    if (result.length === 0) {
      throw new Error('Excel 文件未解析到任何有效行（无表头或全部为空）')
    }
    return result
  }

  /**
   * 解析 CSV（xlsx 库同样支持）→ 行级 Document[]
   * 只取第一个 sheet（CSV 本就是单表）
   */
  private parseCsvRows(file: Express.Multer.File): { sheetName: string; columns: string[]; rowTexts: string[] }[] {
    // file.buffer 是 Buffer<ArrayBufferLike>，而 xlsx 期望 Node 旧版 Buffer。
    // multer 的 buffer 本质是同一段 ArrayBuffer，转一道 any 绕过 TS 5.7+ Buffer 泛型差异。
    const wb = XLSX.read(file.buffer as any, { type: 'buffer' })
    const firstSheetName = wb.SheetNames[0]
    if (!firstSheetName) throw new Error('CSV 文件无有效内容')
    const sheet = wb.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
    if (rows.length === 0) throw new Error('CSV 文件未解析到任何有效行')

    // 列名从第一行 keys 取，空名 fallback col_N
    const firstRow = rows[0] || {}
    const columns = Object.keys(firstRow).map((k, i) => (k && k.trim() ? k.trim() : `col_${i + 1}`))
    const rowTexts: string[] = []
    for (const r of rows) {
      const text = this.serializeRowAsText(r)
      if (text) rowTexts.push(text)
    }
    if (rowTexts.length === 0) throw new Error('CSV 文件未解析到任何有效行（全部为空）')
    return [{ sheetName: firstSheetName, columns, rowTexts }]
  }

  /**
   * 结构化文件 → 行级 chunk → Embedding → Qdrant
   * - 单一文件多 sheet（Excel）→ 每个 sheet 独立行级 chunk
   * - 每个 chunk 聚合 ~3 行（按 chunkSize 600 / overlap 100 走 RecursiveCharacterTextSplitter）
   * - metadata 加 ragTrack='sql' + sheetName + 聚合的 rowIndices 区间
   */
  private async parseStructuredToVectorStore(
    file: Express.Multer.File,
    fileId: number,
    originalName: string,
  ): Promise<void> {
    const ext = path.extname(originalName).toLowerCase()
    let sheets: { sheetName: string; columns: string[]; rowTexts: string[] }[]

    if (ext === '.csv') {
      sheets = this.parseCsvRows(file)
    } else {
      // .xlsx / .xls 一律走 ExcelJS
      sheets = await this.parseExcelRows(file)
    }

    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 600, chunkOverlap: 100 })
    const documents: Document[] = []
    let globalChunkIdx = 0

    for (const { sheetName, columns, rowTexts } of sheets) {
      // rowTexts[i] 对应原始 sheet 的"第 i + 2 行"（第 1 行是表头）
      const chunks = await splitter.splitText(rowTexts.join('\n'))
      // 用 splitText 后无法直接知道每段覆盖了哪些 row，改用 splitText 的返回+二次切分？
      // ——这里走"按 splitter 切完后对每段用行号回填"策略不准确。
      // 退而求其次：每段 metadata 里记录 sheetName + 该 sheet 全部行号（轻量、可追溯），
      // 召回后由 LLM + sheetName 协作定位。
      // ⚠️ originalName 已经被 asyncProcessEtlPipeline 在上游做过 latin1→utf8 解码，
      // 这里不要再解！直接用 originalName，否则会被"二次解码"重新打回乱码。
      for (let i = 0; i < chunks.length; i++) {
        documents.push(
          new Document({
            pageContent: chunks[i],
            metadata: {
              fileId,
              fileName: originalName,
              chunkIndex: globalChunkIdx++,
              ragTrack: 'sql',
              sheetName,
              columns,
              // 行级 rowIndex 列表（覆盖整个 sheet 的所有有效行）—— 召回时可回填精确行号
              rowIndices: rowTexts.map((_, idx) => idx + 2),
            },
          }),
        )
      }
    }

    if (documents.length === 0) {
      throw new Error('结构化文件解析后未产出可向量化文档')
    }

    // 🔧 先用一个 dummy 文本探测当前 embedding 模型的真实维度
    const probeVec = await this.embeddings.embedQuery('__dim_probe__')
    await this.ensureQdrantCollection(probeVec.length)

    await QdrantVectorStore.fromDocuments(documents, this.embeddings, {
      url: this.qdrantUrl,
      collectionName: this.collectionName,
    })

    this.logger.log(`[SQL轨道] fileId=${fileId} 完成行级向量化：${sheets.length} sheet / ${documents.length} chunk`)
  }

  /**
   * 删除一个语料资产：必须保证 DB 行 / Qdrant 向量 / 磁盘文件三处一致。
   *
   * 顺序：先 Qdrant → 再磁盘 → 最后 DB 行（DB 是真源，删了 DB 后 Qdrant/disk 的孤儿无法回追）
   * 容忍：Qdrant 与磁盘任一步失败时记录日志但继续往下走（避免一处失败让用户数据卡在"半删除"状态）
   *
   * 注意：仅对 isFolder=0 的文件节点生效。目录删除由调用方保证不传目录 id。
   */
  async deleteFileEntity(id: number): Promise<void> {
    // 1) 先把记录读出来，拿到 fileUrl（用于定位磁盘文件）
    const record = await this.ragFileRepository.findOneBy({ id })
    if (!record) {
      // 幂等：记录已不存在，直接返回
      this.logger.log(`[RAG 删除] fileId=${id} 记录已不存在，跳过`)
      return
    }
    if (record.isFolder === 1) {
      throw new Error('不支持直接删除目录，请逐项删除内部文件')
    }

    // 2) 删 Qdrant 向量（按 metadata.fileId 过滤）
    try {
      await this.deleteQdrantPointsByFileId(id)
      this.logger.log(`[RAG 删除] Qdrant 清理完成 fileId=${id}`)
    } catch (err) {
      this.logger.error(`[RAG 删除] Qdrant 清理失败 fileId=${id}`, err as any)
      // 不阻断后续清理
    }

    // 3) 删磁盘文件
    if (record.fileUrl) {
      const m = record.fileUrl.match(/\/rag\/([^/?#]+)$/)
      if (m) {
        const diskFilename = m[1]
        const absPath = path.join(RAG_UPLOAD_DIR, diskFilename)
        try {
          const fs = await import('fs')
          await fs.promises.unlink(absPath)
          this.logger.log(`[RAG 删除] 磁盘文件清理完成 fileId=${id} path=${absPath}`)
        } catch (err: any) {
          if (err?.code === 'ENOENT') {
            // 文件本来就不在了，记一行 info 即可
            this.logger.log(`[RAG 删除] 磁盘文件已不存在 fileId=${id} path=${absPath}`)
          } else {
            this.logger.error(`[RAG 删除] 磁盘清理失败 fileId=${id} path=${absPath}`, err as any)
          }
        }
      } else {
        this.logger.warn(`[RAG 删除] fileUrl 无法解析 /rag/ 段 fileId=${id} fileUrl=${record.fileUrl}`)
      }
    }

    // 4) 最后删 DB 行（DB 是真源）
    await this.ragFileRepository.delete(id)
    this.logger.log(`[RAG 删除] DB 行清理完成 fileId=${id}`)
  }

  /**
   * 按 metadata.fileId 删除 Qdrant 中的所有相关点
   * 端点：POST {qdrantUrl}/collections/{collectionName}/points/delete
   */
  private async deleteQdrantPointsByFileId(fileId: number): Promise<void> {
    const url = `${this.qdrantUrl.replace(/\/$/, '')}/collections/${this.collectionName}/points/delete`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'metadata.fileId', match: { value: fileId } }] }
      })
    })
    if (r.ok) return
    // 404 通常意味着 collection 不存在（首次清理场景），忽略
    if (r.status === 404) {
      this.logger.log(`[Qdrant] collection ${this.collectionName} 不存在，跳过向量清理`)
      return
    }
    const txt = await r.text()
    throw new Error(`Qdrant delete failed: HTTP ${r.status} ${txt.slice(0, 300)}`)
  }

  /**
   * 【P1-3】拉取 SQL 轨道引用的真实行数据
   * 用于前端引用预览弹窗渲染"迷你表格"：
   *   - 入参: fileId, sheetName, rowIndices (1-based，与 Excel 行号一致)
   *   - 出参: { columns: string[], rows: Array<Record<string, string | number | null>> }
   *
   * 实现：从磁盘重读 xlsx（不重做向量化，只取单元格值）→ 找到 sheet → 按 rowIndex 抽取。
   * Date 单元格友好化（YYYY-MM-DD）与 ETL 阶段保持一致，确保引用预览与召回文案对得上。
   *
   * 注意：只在 ragTrack='sql' 且扩展名是 .xlsx/.xls/.csv 时有意义；其他类型返回空结构。
   */
  async getStructuredRows(
    fileId: number,
    sheetName: string,
    rowIndices: number[],
  ): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; sheetName: string }> {
    const empty = { columns: [] as string[], rows: [] as Array<Record<string, unknown>>, sheetName }
    if (!Array.isArray(rowIndices) || rowIndices.length === 0) return empty

    const record = await this.ragFileRepository.findOneBy({ id: fileId })
    if (!record) throw new Error('文件不存在')
    if (record.ragTrack !== RagTrackEnum.SQL) {
      return empty // 非 SQL 轨道没"行"概念
    }

    // 从 DB 记录的 fileUrl 提取物理路径（fileUrl = `${serveRoot}/rag/${diskFilename}`）
    // 不能依赖 controller 的 in-memory state（this.serveRoot 私有），
    // 反查 fileUrl → 取 /rag/ 之后的文件名 → 拼成绝对路径
    const fileUrl = record.fileUrl || ''
    const m = fileUrl.match(/\/rag\/([^/?#]+)$/)
    if (!m) {
      // 退化：fileUrl 找不到 rag segment，按 record.fileName 路径试
      return empty
    }
    const diskFilename = m[1]
    const absPath = path.join(RAG_UPLOAD_DIR, diskFilename)
    const ext = path.extname(record.fileName || '').toLowerCase()

    // 读 buffer
    const fs = await import('fs')
    let buffer: Buffer
    try {
      buffer = await fs.promises.readFile(absPath)
    } catch {
      throw new Error(`文件已离线：${absPath}`)
    }

    let columns: string[] = []
    const rows: Array<Record<string, unknown>> = []

    if (ext === '.csv') {
      const wb = XLSX.read(buffer as any, { type: 'buffer' })
      const target = wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0]
      if (!target) return empty
      const sheet = wb.Sheets[target]
      const arr = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
      if (arr.length === 0) return empty
      // 列名：第一行 keys
      const first = arr[0] || {}
      columns = Object.keys(first).map((k, i) => (k && k.trim() ? k.trim() : `col_${i + 1}`))
      // 唯一列名（去重）
      columns = this.dedupeColumns(columns)
      // rowIndices 1-based → arr 是 0-based
      for (const r of rowIndices) {
        const idx = r - 2 // 第 1 行是表头 → 数据从 index 0 开始；r=2 对应 arr[0]
        if (idx >= 0 && idx < arr.length) {
          const obj: Record<string, unknown> = {}
          columns.forEach((c, i) => {
            const origKey = Object.keys(first)[i]
            obj[c] = this.stringifyCellValue(arr[idx]?.[origKey])
          })
          rows.push(obj)
        }
      }
    } else {
      // .xlsx / .xls
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buffer as any)
      const ws = wb.getWorksheet(sheetName)
      if (!ws) return empty
      // 表头（第 1 行）
      const headerRow = ws.getRow(1)
      const rawCols: string[] = []
      for (let c = 1; c <= headerRow.cellCount; c++) {
        const v = headerRow.getCell(c).value
        const col = v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
          ? `col_${c}`
          : String(v).trim()
        rawCols.push(col)
      }
      columns = this.dedupeColumns(rawCols)
      // 按 rowIndices 取行
      for (const r of rowIndices) {
        if (r < 1) continue
        const row = ws.getRow(r)
        if (!row) continue
        const obj: Record<string, unknown> = {}
        for (let c = 1; c <= columns.length; c++) {
          let v: unknown = row.getCell(c).value
          // 公式 → result
          if (v && typeof v === 'object' && 'result' in (v as any)) v = (v as any).result
          // 复对象：富文本提取
          obj[columns[c - 1]] = this.stringifyCellValue(v)
        }
        rows.push(obj)
      }
    }

    return { columns, rows, sheetName }
  }

  /**
   * ExcelJS 解析时如果表头有重名列，Qdrant metadata.columns 是直接保留重名。
   * 预览时为了 el-table 能 v-for，需要把重名列改名 col_2 / col_3 ...
   * 注意：这只是"展示用"的去重，不影响 ETL 召回的 metadata.columns。
   */
  private dedupeColumns(cols: string[]): string[] {
    const seen = new Map<string, number>()
    return cols.map((c) => {
      const count = seen.get(c) || 0
      seen.set(c, count + 1)
      return count === 0 ? c : `${c}_${count + 1}`
    })
  }

  // ============================================================================
  // 💬【P1-2】会话 & 消息 CRUD
  // ============================================================================

  /**
   * 列出当前用户的会话（按更新时间倒序）
   */
  async listSessions(userId: number): Promise<RagSessionEntity[]> {
    return await this.ragSessionRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 50,
    })
  }

  /**
   * 创建一个空会话
   */
  async createSession(userId: number, title?: string): Promise<RagSessionEntity> {
    const session = this.ragSessionRepository.create({
      userId,
      title: title?.trim() || '新会话',
    })
    return await this.ragSessionRepository.save(session)
  }

  /**
   * 校验会话归属当前用户，返回会话或 null
   */
  async getOwnedSession(sessionId: number, userId: number): Promise<RagSessionEntity | null> {
    const s = await this.ragSessionRepository.findOne({ where: { id: sessionId } })
    if (!s || s.userId !== userId) return null
    return s
  }

  /**
   * 拉取一个会话的全部消息（按时间正序）
   */
  async listMessages(sessionId: number): Promise<RagMessageEntity[]> {
    return await this.ragMessageRepository.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    })
  }

  /**
   * 重命名会话
   */
  async renameSession(sessionId: number, userId: number, title: string): Promise<boolean> {
    const owned = await this.getOwnedSession(sessionId, userId)
    if (!owned) return false
    await this.ragSessionRepository.update(sessionId, { title: title.trim() || '新会话' })
    return true
  }

  /**
   * 删除会话（级联删消息）
   */
  async deleteSession(sessionId: number, userId: number): Promise<boolean> {
    const owned = await this.getOwnedSession(sessionId, userId)
    if (!owned) return false
    await this.ragSessionRepository.delete(sessionId)
    return true
  }

  /**
   * 把一轮对话（user + assistant + citations）写库
   */
  private async appendTurn(
    sessionId: number,
    userContent: string,
    assistantContent: string,
    citations: CitationDto[] | null,
  ): Promise<void> {
    // user 消息
    await this.ragMessageRepository.save(
      this.ragMessageRepository.create({
        sessionId,
        role: 'user',
        content: userContent,
        citations: null,
      }),
    )
    // assistant 消息
    await this.ragMessageRepository.save(
      this.ragMessageRepository.create({
        sessionId,
        role: 'assistant',
        content: assistantContent,
        citations,
      }),
    )
    // 刷新会话 updated_at
    await this.ragSessionRepository.update(sessionId, { updatedAt: new Date() })

    // 若标题仍是默认 "新会话"，用首条用户消息前 24 字自动命名
    const session = await this.ragSessionRepository.findOne({ where: { id: sessionId } })
    if (session && session.title === '新会话') {
      const auto = userContent.replace(/\s+/g, ' ').trim().slice(0, 24) || '新会话'
      await this.ragSessionRepository.update(sessionId, { title: auto })
    }
  }

  /**
   * 拼装多轮对话上下文（取最近 N 轮）
   */
  private async buildHistoryContext(sessionId: number, limit = 6): Promise<HistoryTurn[]> {
    const all = await this.listMessages(sessionId)
    const tail = all.slice(-limit)
    return tail.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  }

  // ============================================================================
  // 🔥【P1-2】流式问答（接入会话持久化 + 多轮上下文）
  // ============================================================================

  /**
   * Qdrant 相似度检索助手
   * @param question  用户问题
   * @param fileIds   限定检索的文件 id 列表。
   *                  - null = 全库检索（不应用 fileId 过滤）—— P1-6 新增
   *                  - []   = 不检索（外部应跳过调用）
   *                  - [n1, n2, ...] = 仅检索这些文件下的 chunk
   */
  private async vectorSearch(
    question: string,
    fileIds: number[] | null,
  ): Promise<{ doc: Document; score: number }[]> {
    try {
      const vectorStore = await QdrantVectorStore.fromExistingCollection(this.embeddings, {
        url: this.qdrantUrl,
        collectionName: this.collectionName,
      })
      // ⚠️ Qdrant 的 `match.any` 只对 array 字段有效，对 scalar int 字段会返回 0 命中。
      // 单值用 `match: { value: X }`；多值用 `should` 拼多个 value 子句（语义等同"或"）。
      let filter: any = undefined
      if (Array.isArray(fileIds) && fileIds.length > 0) {
        filter =
          fileIds.length === 1
            ? { must: [{ key: 'metadata.fileId', match: { value: fileIds[0] } }] }
            : {
                should: fileIds.map((id) => ({
                  key: 'metadata.fileId',
                  match: { value: id },
                })),
              }
      }
      const raw = await vectorStore.similaritySearchWithScore(question, 4, filter as any)
      return raw.map(([doc, score]) => ({ doc, score }))
    } catch (vErr) {
      this.logger.error('[Qdrant 相似度检索失败]', vErr as any)
      return []
    }
  }

  async executeDualTrackQuery(
    question: string,
    sessionId: string | number | null,
    sources: number[],
    res: Response,
    userId: number,
  ): Promise<void> {
    // 1) 解析/创建会话
    let ownedSession: RagSessionEntity | null = null
    if (sessionId) {
      const sid = Number(sessionId)
      if (!Number.isNaN(sid)) {
        ownedSession = await this.getOwnedSession(sid, userId)
      }
    }
    if (!ownedSession) {
      ownedSession = await this.createSession(userId, question.slice(0, 24))
      // 把新会话 ID 通过 SSE 第一帧推给前端
      res.write(
        `data: ${JSON.stringify({ code: 'session', data: { id: ownedSession.id, title: ownedSession.title } })}\n\n`,
      )
    }

    // 2) 拼装多轮上下文
    const history = await this.buildHistoryContext(ownedSession.id, 6)

    res.write(`data: ${JSON.stringify({ code: 200, data: '正在检索关联知识库资产...\n' })}\n\n`)
    let citations: CitationDto[] = []
    let fullAnswer = ''

    try {
      let relevantDocs: { doc: Document; score: number }[] = []
      if (sources && sources.length > 0) {
        // 【P1-4】树形勾选：先把"文件夹 id + 文件 id"混合列表展开为纯文件 id
        const effectiveFileIds = await this.expandAssetIdsToFileIds(sources)
        if (effectiveFileIds.length > 0) {
          relevantDocs = await this.vectorSearch(question, effectiveFileIds)
        }
      } else {
        // 【P1-6】未勾选任何资产：走全库相似度检索（不带 fileId 过滤）
        relevantDocs = await this.vectorSearch(question, null)
      }

      if (relevantDocs.length === 0) {
        res.write(
          `data: ${JSON.stringify({ code: 200, data: '未在参考资料中发现线索，转由大语言模型泛化解答：\n\n' })}\n\n`,
        )
        fullAnswer = await this.streamLlmWithHistory(history, question, null, res)
      } else {
        citations = relevantDocs.map(({ doc, score }) => ({
          fileId: doc.metadata?.fileId,
          fileName: doc.metadata?.fileName || '未知来源',
          chunkIndex: doc.metadata?.chunkIndex ?? -1,
          content: (doc.pageContent || '').replace(/\s+/g, ' ').trim().slice(0, 280),
          score: typeof score === 'number' ? Math.max(0, Math.min(1, 1 - score)) : null,
          // 【P1-3】SQL 轨道扩展字段透传给前端
          ragTrack: doc.metadata?.ragTrack || 'vector',
          sheetName: doc.metadata?.sheetName ?? null,
          rowIndices: doc.metadata?.rowIndices ?? null,
          columns: doc.metadata?.columns ?? null,
        }))
        res.write(`data: ${JSON.stringify({ code: 'sources', data: citations })}\n\n`)

        // 【P1-3】SQL 轨道走"行级上下文"格式，长文本维持原样
        // 关键升级：SQL 轨道除了 pageContent，还把 rowIndices + columns 结构化元信息塞进 prompt
        // —— LLM 知道"第几行"、列名是什么，能精准引用（如"华东 A 产品的销量（第 2 行）是 120"）
        const hasSqlTrack = relevantDocs.some((d) => d.doc.metadata?.ragTrack === 'sql')
        const contextText = hasSqlTrack
          ? relevantDocs
              .map(({ doc }) => {
                const m = doc.metadata || {}
                if (!m.sheetName) {
                  return `【参考源: ${m.fileName}】\n${doc.pageContent}`
                }
                // 🔧 关键：把列名 + 行号范围 + 行级内容一起拼，LLM 才知道"哪个单元格在第几行"
                const cols = Array.isArray(m.columns) && m.columns.length > 0 ? m.columns.join(' | ') : '(无列名)'
                const rowList = Array.isArray(m.rowIndices) && m.rowIndices.length > 0
                  ? m.rowIndices.length <= 20
                    ? m.rowIndices.join(', ')
                    : `${m.rowIndices.slice(0, 8).join(', ')} … ${m.rowIndices.slice(-3).join(', ')} (共 ${m.rowIndices.length} 行)`
                  : '(无行号)'
                return `【表格行级参考: ${m.fileName} / ${m.sheetName}】
  - 列名: ${cols}
  - 涉及行号 (Excel 1-based): ${rowList}
  - 行级数据:
${doc.pageContent}`
              })
              .join('\n\n')
          : relevantDocs.map(({ doc }) => `【参考源: ${doc.metadata?.fileName}】\n${doc.pageContent}`).join('\n\n')

        const systemPrompt = hasSqlTrack
          ? `你是一款高级 AI 助手，专精于结构化表格的精准问答。回答规范：
1) 严格基于下方"表格行级参考"中的字段值与行号进行精确计算，不要凭空捏造数字。
2) 涉及具体单元格时，引用形式形如「{列名}={值}（第 {行号} 行 / {sheetName}）」，让用户能精准回溯。
3) 涉及统计/求和/比较时，先列出你引用的行号，再给出计算过程，最后给结论。
4) 若问题无法在参考表格中找到答案，明确告知"在所引用的表格行中未找到依据"，禁止臆测。

【参考资料】:
${contextText}`
          : `你是一款高级 AI 助手。请严格基于参考内容回答问题。

【参考资料】:
${contextText}`

        res.write(
          `data: ${JSON.stringify({
            code: 200,
            data: hasSqlTrack
              ? '已定位到结构化表格行级数据，深度运算中：\n\n'
              : '已为您提炼关联企业物料，深度解答中：\n\n',
          })}\n\n`,
        )
        fullAnswer = await this.streamLlmWithHistory(history, question, systemPrompt, res)
      }
    } catch (err) {
      this.logger.error('[RAG 运行流内部异常捕捉并安全消化]', err)
      const errorDetails = err instanceof Error ? err.message : '大模型集群响应超时'
      res.write(`data: ${JSON.stringify({ code: 500, data: `\n[系统决策阻断]: ${errorDetails}` })}\n\n`)
    } finally {
      // 3) 持久化本轮对话
      try {
        await this.appendTurn(ownedSession.id, question, fullAnswer, citations)
      } catch (persistErr) {
        this.logger.error(`[RAG 会话持久化失败] sessionId=${ownedSession.id}`, persistErr as any)
      }
      res.write(`data: ${JSON.stringify(ResultData.ok(''))}\n\n`)
    }
  }

  /**
   * 把历史 + 当前问题拼成 LangChain messages，调用 LLM 流式输出并拼接完整文本
   */
  private async streamLlmWithHistory(
    history: HistoryTurn[],
    question: string,
    systemPrompt: string | null,
    res: Response,
  ): Promise<string> {
    const messages: Array<['system' | 'human' | 'assistant', string]> = []
    if (systemPrompt) messages.push(['system', systemPrompt])
    for (const turn of history) {
      messages.push([turn.role === 'user' ? 'human' : 'assistant', turn.content])
    }
    messages.push(['human', question])

    const responseStream = await this.llm.stream(messages as any)
    let full = ''
    for await (const chunk of responseStream) {
      const content = typeof chunk === 'string' ? chunk : (chunk as any).content || ''
      if (content) {
        full += content
        res.write(`data: ${JSON.stringify({ code: 200, data: content })}\n\n`)
      }
    }
    return full
  }
}
