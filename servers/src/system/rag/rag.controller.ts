import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Res,
  UseGuards,
  Req,
  Query,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  ParseIntPipe,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Response } from 'express'
import { diskStorage } from 'multer'
import * as path from 'path'
import { RagService } from './rag.service'
import { JwtAuthGuard } from '../../common/guards/auth.guard'
import { AllowNoPerm } from '../../common/decorators/perm.decorator'
import { UserType } from '../../common/enums/common.enum'
import { ResultData } from '../../common/utils/result'

import { Keep } from '../../common/decorators/keep.decorator'
import { RAG_UPLOAD_DIR } from './rag-upload.util'
import { AuditInterceptor } from '../audit/audit.interceptor'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { RAG_ETL_QUEUE_NAME, RAG_ETL_JOB_RUN, RagEtlJobData } from './rag-etl.constants'

/**
 * RAG 知识库 HTTP 端点（路由前缀 `/api/rag`）
 *
 * - 资产 CRUD：folder/create、file/upload、file/delete、file/retry、files/list、file/structured-rows
 * - 会话：sessions 列表/新建/重命名/删除、sessions/:id/messages 历史
 * - 流式问答：ask-stream（SSE，@Keep 跳过全局响应包装）
 *
 * 鉴权：所有端点要求登录（JwtAuthGuard），权限校验按"普通用户只能看自己文件，超管旁路"模型
 * 审计：@UseInterceptors(AuditInterceptor) 自动记录所有 endpoint 操作
 */
@ApiTags('企业级双轨制核心知识库 RAG')
@ApiBearerAuth()
@Controller('rag')
@UseGuards(JwtAuthGuard)
@UseInterceptors(AuditInterceptor) // RAG 模块所有 endpoint 自动审计
export class RagController {
  // 上传根目录用模块顶层 RAG_UPLOAD_DIR 常量（@UseInterceptors 装饰器先于构造函数求值，必须顶层可用）
  private readonly serveRoot: string
  private readonly fileDomain: string
  // BullMQ ETL 队列（持久化 + 自动重试 + 并发控制 concurrency=3）
  /**
   * @param ragService RAG Service
   * @param config     NestJS ConfigService
   * @param etlQueue   BullMQ ETL 队列
   */
  constructor(
    private readonly ragService: RagService,
    private readonly config: ConfigService,
    @InjectQueue(RAG_ETL_QUEUE_NAME) private readonly etlQueue: Queue<RagEtlJobData>,
  ) {
    this.serveRoot = this.config.get<string>('app.file.serveRoot') || ''
    this.fileDomain = this.config.get<string>('app.file.domain') || ''
  }

  // ============================================================================
  // 🔐 鉴权辅助：UserEntity.id 是 bigint（JS 端是 string），但 RAG 模块的 userId 字段是 int
  // 所有 controller 统一在这里转 Number()，避免在 service 层做 === 比较时 string vs number 永远不等
  // ============================================================================
  /**
   * 把 req.user.id（bigint 字符串）解析为 number
   * @param req Express 请求
   * @returns 数字 ID；未登录 / 解析失败返回 null
   */
  private resolveUserId(req: any): number | null {
    const raw = req.user?.id
    if (raw === undefined || raw === null || raw === '') return null
    const num = Number(raw)
    return Number.isFinite(num) ? num : null
  }

  /**
   * 判断当前请求是否来自超管用户
   * - 超管可绕过 userId 过滤，看/操作所有用户文件
   * @param req Express 请求
   */
  private isSuperAdmin(req: any): boolean {
    return req.user?.type === UserType.SUPER_ADMIN
  }

  // ============================================================================
  // 📂 知识库资产 CRUD
  // ============================================================================

  @Get('files/list')
  @AllowNoPerm()
  @ApiOperation({ summary: '查询虚拟隔离仓 file 列表' })
  /**
   * 查询指定 parentId 目录下的文件/文件夹列表（按 userId 隔离，超管旁路）
   * @param req    Express request（含 req.user）
   * @param parentId 父级目录 ID（0 = 根目录）
   * @returns 标准化后的文件列表（size: bigint → number 显式转换）
   */
  async getFileList(@Req() req: any, @Query('parentId') parentId: string) {
    // 按 userId 过滤，超管跳过
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const files = await this.ragService.getKnowledgeFileList(
      Number(parentId) || 0,
      userId,
      this.isSuperAdmin(req),
    )
    // 🔧 后端 size 字段是 bigint，TypeORM 默认以 string 返回 JS 端避免精度丢失；
    // 前端 RagAssetItem.size 类型是 number（formatSize 内部走 Math.log 字符串隐式转 number 不可靠），
    // 这里显式转 number 一次，让前端格式化逻辑稳。
    const normalized = files.map((f) => ({ ...f, size: Number(f.size) || 0 }))
    return ResultData.ok(normalized)
  }

  @Post('folder/create')
  @ApiOperation({ summary: '创建虚拟知识文件夹' })
  /**
   * 在指定 parentId 下创建一个文件夹节点
   * @param dto.name      文件夹名
   * @param dto.parentId  父目录 ID（0 = 根目录）
   */
  async createFolder(@Req() req: any, @Body() dto: { name: string; parentId: number }) {
    // 仅要求登录用户即可创建自己的目录（不再硬性 admin-only）
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const result = await this.ragService.createFolder(dto.name, Number(dto.parentId) || 0, userId)
    return ResultData.ok(result)
  }

  @Post('file/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // 🔧 用 diskStorage 真存到磁盘（之前默认 memoryStorage，fileUrl 是骗人的）
      // 注意：@UseInterceptors 装饰器先于构造函数求值，this.uploadRoot 此时是 undefined，
      // 用模块顶层懒加载的 RAG_UPLOAD_DIR 常量，避免装饰器先于构造函数求值时 this 不可用
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, RAG_UPLOAD_DIR),
        filename: (_req, file, cb) => {
          // 🔧 multer 2.x 拿到 multipart header 里的 UTF-8 字节流后，**永远**按 latin1 字符串存到
          // file.originalname（iconv-lite 的 UTF-8 自动识别只对 RFC 5987 头 `filename*=UTF-8''...` 生效，
          // 而浏览器 / axios 不会发这种头）。所以这里无条件做一次 latin1→utf8 反向解码，
          // 把 "å¬å¸..." 还原成正确的 "公司人事部..."。后续转码用 try/catch 兜底 latin1 不丢。
          const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8')
          // 时间戳前缀避免重名
          const finalName = `${Date.now()}_${safeName}`
          cb(null, finalName)
        },
      }),
      // 文件大小上限 50MB，防止 OOM/磁盘占满；
      // 超限后 multer 抛 MulterError('LIMIT_FILE_SIZE')，controller 层不重启
      limits: { fileSize: 50 * 1024 * 1024 },
      // MIME 白名单：只允许 7 种已知安全的扩展名
      // 阻止可执行文件 / 宏文档 / 未知脚本上传（防止恶意上传绕过 size 限制）
      // cb(null, false) 表示"拒绝但不抛错"，multer 会跳过该文件
      // frontend 拿到的是 file=undefined，可根据 400 错误给出"文件类型不支持"提示
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase()
        if (RagService.ALLOWED_UPLOAD_EXTS.includes(ext)) {
          cb(null, true)
        } else {
          cb(null, false)
        }
      },
    }),
  )
  @ApiOperation({ summary: '上传并注册语料文件资产' })
  /**
   * 上传文件 → 写入磁盘 → 注册到 RagFileEntity → 入 BullMQ 队列触发 ETL
   * - 文件大小上限 50MB（multer limits）
   * - MIME 白名单（7 种安全扩展名）：txt/md/pdf/docx/xlsx/csv/json
   * - 原始文件名做 latin1→utf8 反向解码（修复中文乱码）
   * - 入队后 HTTP 立即返回 200，ETL 由 RagFileProcessor 异步执行
   */
  async uploadAndRegisterFile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('parentId') parentId: string,
  ) {
    // 仅要求登录用户即可上传自己文件（不再硬性 admin-only）
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    if (!file) {
      return ResultData.fail(HttpStatus.BAD_REQUEST, '未检测到上传文件流')
    }
    // diskStorage 下 file.path 才是真实物理路径；file.filename 是 dest 里磁盘上的文件名（含时间戳前缀）
    // 把物理路径 + 真实访问 URL 一起传给 service，让它写到数据库
    const record = await this.ragService.registerPhysicalFile(
      file,
      Number(parentId) || 0,
      userId,
      this.serveRoot,
      this.fileDomain,
    )
    // ETL 任务入队（持久化 + 自动重试 + 并发控制由 BullMQ 处理）
    await this.etlQueue.add(
      RAG_ETL_JOB_RUN,
      { filePath: file.path, fileId: record.id, originalName: file.originalname, userId },
    )
    return ResultData.ok(record, '文件接收成功，异步清洗任务已激活')
  }

  @Delete('file/delete')
  @ApiOperation({ summary: '物理擦除知识库资产' })
  /**
   * 删除指定文件/文件夹（同时清 Qdrant 向量 + 物理磁盘文件）
   * @param id RagFileEntity.id
   */
  async deleteFile(@Req() req: any, @Query('id') id: string) {
    // 任何登录用户都能删自己的文件，超管可删所有
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const result = await this.ragService.deleteFileEntity(
      Number(id),
      userId,
      this.isSuperAdmin(req),
    )
    return result.ok
      ? ResultData.ok(null, '该项语料资产已完成安全下线与销毁')
      : ResultData.fail(HttpStatus.FORBIDDEN, result.reason || '删除失败')
  }

  // ============================================================================
  // 🔁ETL 重试：FAILED 状态的资产可手动重跑 ETL（不重新上传文件）
  // ============================================================================

  @Post('file/retry')
  @ApiOperation({ summary: '重跑 ETL（文件已上传但 ETL 失败时使用）' })
  /**
   * 重跑 ETL：service 先清旧 chunks + 重置 vectorStatus=PENDING，
   * controller 再入队列触发实际 ETL 任务
   */
  async retryEtl(@Req() req: any, @Query('id') id: string) {
    // 任何登录用户都能重试自己的文件，超管可重试所有
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const result = await this.ragService.retryFailedEtl(
      Number(id),
      userId,
      this.isSuperAdmin(req),
    )
    if (!result.ok) {
      return ResultData.fail(HttpStatus.BAD_REQUEST, result.reason || '重试失败')
    }
    // service 完成"准备"（状态重置 + 清旧 chunks）后，controller 推队列触发实际 ETL
    await this.etlQueue.add(
      RAG_ETL_JOB_RUN,
      {
        filePath: result.filePath,
        fileId: Number(id),
        originalName: result.fileName,
        userId,
      },
    )
    return ResultData.ok(null, 'ETL 重试已加入队列')
  }

  // ============================================================================
  // 📊SQL 轨道引用预览：拉取真实行数据
  // ============================================================================

  @Post('file/structured-rows')
  @AllowNoPerm()
  @ApiOperation({ summary: '拉取 SQL 轨道引用对应的真实行数据（用于预览弹窗渲染迷你表格）' })
  /**
   * SQL 轨道引用预览：按 fileId + sheetName + rowIndices 拉取真实行数据
   * 防御：单次最多 100 行 + 归属校验（用户 A 不能拿用户 B 的 Excel 行）
   */
  async getStructuredRows(
    @Req() req: any,
    @Body() dto: { fileId: number; sheetName: string; rowIndices: number[] },
  ) {
    const { fileId, sheetName, rowIndices } = dto || ({} as any)
    if (!fileId || !sheetName || !Array.isArray(rowIndices) || rowIndices.length === 0) {
      return ResultData.fail(HttpStatus.BAD_REQUEST, '参数缺失：fileId/sheetName/rowIndices')
    }
    // 防御：单次最多 100 行，避免有人塞一整个 sheet
    if (rowIndices.length > 100) {
      return ResultData.fail(HttpStatus.BAD_REQUEST, '单次最多 100 行')
    }
    // 归属校验：用户 A 拿不到用户 B 的 Excel 行数据
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    try {
      const result = await this.ragService.getStructuredRows(
        fileId,
        sheetName,
        rowIndices,
        userId,
        this.isSuperAdmin(req),
      )
      return ResultData.ok(result)
    } catch (err: any) {
      // getStructuredRows 在无权访问时 throw Error('文件不存在或无权访问')
      const msg = err?.message || '查询失败'
      return ResultData.fail(HttpStatus.FORBIDDEN, msg)
    }
  }

  // ============================================================================
  // 💬会话与消息
  // ============================================================================

  @Get('sessions')
  @AllowNoPerm()
  @ApiOperation({ summary: '获取当前用户的会话列表（按更新时间倒序）' })
  /**
   * 列出当前用户全部会话（按 updatedAt DESC）
   * @param req Express 请求
   */
  async listSessions(@Req() req: any) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const list = await this.ragService.listSessions(userId)
    return ResultData.ok(list)
  }

  @Post('sessions')
  @AllowNoPerm()
  @ApiOperation({ summary: '新建一个空会话' })
  /**
   * 新建一个空会话（title 可选；首条消息写入后会自动改写为前 20 字摘要）
   * @param req Express 请求
   * @param dto { title?: 自定义标题 }
   */
  async createSession(@Req() req: any, @Body() dto: { title?: string }) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const session = await this.ragService.createSession(userId, dto?.title)
    return ResultData.ok(session)
  }

  @Get('sessions/:id/messages')
  @AllowNoPerm()
  @ApiOperation({ summary: '获取某个会话的全部消息' })
  /**
   * 拉取某会话的全部消息（按 createdAt 升序），会做归属校验
   * @param req Express 请求
   * @param id  会话 ID（path param）
   */
  async listMessages(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const owned = await this.ragService.getOwnedSession(id, userId)
    if (!owned) return ResultData.fail(HttpStatus.FORBIDDEN, '会话不存在或无权访问')
    const messages = await this.ragService.listMessages(id)
    return ResultData.ok(messages)
  }

  @Patch('sessions/:id')
  @AllowNoPerm()
  @ApiOperation({ summary: '重命名会话' })
  /**
   * 重命名会话（归属校验 + title 非空校验）
   * @param req Express 请求
   * @param id  会话 ID（path param）
   * @param dto { title: 新标题 }
   */
  async renameSession(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: { title: string }) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const ok = await this.ragService.renameSession(id, userId, dto?.title || '')
    return ok ? ResultData.ok(null, '会话已重命名') : ResultData.fail(HttpStatus.FORBIDDEN, '会话不存在或无权访问')
  }

  @Delete('sessions/:id')
  @AllowNoPerm()
  @ApiOperation({ summary: '删除会话（级联删除消息）' })
  /**
   * 删除会话（TypeORM cascade 自动清理 messages 表）
   * @param req Express 请求
   * @param id  会话 ID（path param）
   */
  async deleteSession(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const ok = await this.ragService.deleteSession(id, userId)
    return ok ? ResultData.ok(null, '会话已安全下线') : ResultData.fail(HttpStatus.FORBIDDEN, '会话不存在或无权访问')
  }

  // ============================================================================
  // 🔥流式问答（带会话持久化 + 多轮上下文）
  // ============================================================================

  @Post('ask-stream')
  @AllowNoPerm()
  @Keep()
  @ApiOperation({ summary: '首页流式对话问答（自动会话管理 + 多轮记忆）' })
  /**
   * 流式问答 SSE 端点
   * - @Keep 跳过全局响应包装（必须直写 res）
   * - Content-Type: text/event-stream; charset=utf-8 + SSE 必要头
   * - 客户端断开：AbortController 监听 res.on('close'/'error')，触发后立即停止 LLM stream
   * - 服务层委托给 RagService.executeDualTrackQuery（双轨检索 + LLM 流）
   */
  async askStream(
    @Req() req: any,
    @Body() dto: { question: string; sessionId?: number | string; sources?: number[] },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 客户端主动断开（abort / 关页 / 网络断）时，立刻触发 signal，
    // 让 service 里的 LLM stream 循环尽快退出，停止消耗 token。
    //
    // 关键：必须用 `res.on('close')` 而不是 `req.on('close')`。
    // 验证发现 fetch + AbortController.abort() 不会立即让 req 触发 close，
    // 但 Express 的 response writable stream 会在对端断开时立刻 emit 'close'。
    // 同时再监听 'error' / 'finish' 兜底，确保任何终止路径都覆盖到。
    const ac = new AbortController()
    const fireAbort = () => {
      if (!ac.signal.aborted) ac.abort()
    }
    res.on('close', fireAbort)
    res.on('error', fireAbort)

    const userId = this.resolveUserId(req)
    const question = dto.question || ''
    const sessionId = dto.sessionId ?? null
    const sources = dto.sources || []

    try {
      if (userId === null) {
        res.write(`data: ${JSON.stringify(ResultData.fail(401, '未识别到用户身份，请重新登录'))}\n\n`)
        return
      }
      await this.ragService.executeDualTrackQuery(
        question,
        sessionId,
        sources,
        res,
        userId,
        this.isSuperAdmin(req), // 超管旁路
        ac.signal,
      )
    } catch (error) {
      console.error('[RAG Controller 顶层防线捕捉]', error)
      const errorMessage = error instanceof Error ? error.message : '服务器内部发生决策性阻断'
      if (!res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify(ResultData.fail(500, errorMessage))}\n\n`)
        } catch { /* ignore */ }
      }
    } finally {
      if (!res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify(ResultData.ok(null, 'stream_ended'))}\n\n`)
        } catch { /* ignore */ }
        res.end()
      }
    }
  }
}
