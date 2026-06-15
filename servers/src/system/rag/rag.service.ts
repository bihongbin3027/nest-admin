import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import { Response } from 'express'
import * as path from 'path'

import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { QdrantVectorStore } from '@langchain/qdrant'
import { PDFParse } from 'pdf-parse'
import * as mammoth from 'mammoth'

import { RagFileEntity, RagTrackEnum, VectorStatusEnum } from './rag-file.entity'
import { RagSessionEntity } from './rag-session.entity'
import { RagMessageEntity } from './rag-message.entity'
import { ResultData } from '../../common/utils/result'

/**
 * 【P1-2】引用源条目
 */
export interface CitationDto {
  fileId: number
  fileName: string
  chunkIndex: number
  content: string
  score: number | null
}

/**
 * 【P1-2】历史消息（用于多轮对话上下文拼装）
 */
interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name)
  private readonly llm: ChatOpenAI
  private readonly embeddings: OpenAIEmbeddings
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
    const modelName = this.configService.get<string>('ai.llm.modelName')
    this.qdrantUrl = this.configService.get<string>('ai.qdrant.url')
    this.collectionName = this.configService.get<string>('ai.qdrant.collectionName')

    this.llm = new ChatOpenAI({ apiKey, configuration: { baseURL }, modelName, temperature: 0.2, streaming: true })
    this.embeddings = new OpenAIEmbeddings({ apiKey, configuration: { baseURL } })
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

  async registerPhysicalFile(file: Express.Multer.File, parentId: number): Promise<RagFileEntity> {
    const ext = path.extname(file.originalname).toLowerCase()
    let track = RagTrackEnum.VECTOR

    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      track = RagTrackEnum.SQL
    }

    const fileEntity = this.ragFileRepository.create({
      fileName: file.originalname,
      parentId: parentId,
      isFolder: 0,
      fileUrl: `uploads/rag/${Date.now()}_${file.originalname}`,
      size: file.size,
      fileType: ext,
      ragTrack: track,
      vectorStatus: VectorStatusEnum.PROCESSING,
    })

    return await this.ragFileRepository.save(fileEntity)
  }

  async asyncProcessEtlPipeline(file: Express.Multer.File, fileId: number): Promise<void> {
    try {
      const record = await this.ragFileRepository.findOneBy({ id: fileId })
      if (!record) return

      if (record.ragTrack === RagTrackEnum.SQL) {
        this.logger.log(`[SQL轨道] 正在为文件 ID ${fileId} 进行行列治理提取...`)
      } else {
        await this.parseDocumentToVectorStore(file, fileId)
      }

      await this.ragFileRepository.update(fileId, { vectorStatus: VectorStatusEnum.SUCCESS })
    } catch (error) {
      this.logger.error(`[RAG ETL 异步管道崩溃] FILE_ID: ${fileId}`, error)
      await this.ragFileRepository.update(fileId, {
        vectorStatus: VectorStatusEnum.FAILED,
        errorMessage: error instanceof Error ? error.message : '未知切片崩溃异常',
      })
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

    await QdrantVectorStore.fromDocuments(documents, this.embeddings, {
      url: this.qdrantUrl,
      collectionName: this.collectionName,
    })
  }

  async deleteFileEntity(id: number): Promise<void> {
    await this.ragFileRepository.delete(id)
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
      res.write(`data: ${JSON.stringify({ code: 'session', data: { id: ownedSession.id, title: ownedSession.title } })}\n\n`)
    }

    // 2) 拼装多轮上下文
    const history = await this.buildHistoryContext(ownedSession.id, 6)

    res.write(`data: ${JSON.stringify({ code: 200, data: '正在检索关联知识库资产...\n' })}\n\n`)
    let citations: CitationDto[] = []
    let fullAnswer = ''

    try {
      let relevantDocs: { doc: Document; score: number }[] = []
      if (sources && sources.length > 0) {
        try {
          const vectorStore = await QdrantVectorStore.fromExistingCollection(this.embeddings, {
            url: this.qdrantUrl,
            collectionName: this.collectionName,
          })
          const raw = await vectorStore.similaritySearchWithScore(question, 4, {
            filter: { must: [{ key: 'metadata.fileId', match: { any: sources } }] },
          } as any)
          relevantDocs = raw.map(([doc, score]) => ({ doc, score }))
        } catch (vErr) {
          relevantDocs = []
        }
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
        }))
        res.write(`data: ${JSON.stringify({ code: 'sources', data: citations })}\n\n`)

        const contextText = relevantDocs
          .map(({ doc }) => `【参考源: ${doc.metadata?.fileName}】\n${doc.pageContent}`)
          .join('\n\n')
        res.write(`data: ${JSON.stringify({ code: 200, data: '已为您提炼关联企业物料，深度解答中：\n\n' })}\n\n`)

        const systemPrompt = `你是一款高级 AI 助手。请严格基于参考内容回答问题。\n\n【参考资料】:\n${contextText}`
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
