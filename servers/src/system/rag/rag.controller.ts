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
  ParseIntPipe
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Response } from 'express'
import { RagService } from './rag.service'
import { JwtAuthGuard } from '../../common/guards/auth.guard'
import { AllowNoPerm } from '../../common/decorators/perm.decorator'
import { UserType } from '../../common/enums/common.enum'
import { ResultData } from '../../common/utils/result'

import { Keep } from '../../common/decorators/keep.decorator'

@ApiTags('企业级双轨制核心知识库 RAG')
@ApiBearerAuth()
@Controller('rag')
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private readonly ragService: RagService) {}

  // ============================================================================
  // 🔐 鉴权辅助：UserEntity.id 是 bigint（JS 端是 string），但 RAG 模块的 userId 字段是 int
  // 所有 controller 统一在这里转 Number()，避免在 service 层做 === 比较时 string vs number 永远不等
  // ============================================================================
  private resolveUserId(req: any): number | null {
    const raw = req.user?.id
    if (raw === undefined || raw === null || raw === '') return null
    const num = Number(raw)
    return Number.isFinite(num) ? num : null
  }

  // ============================================================================
  // 📂 知识库资产 CRUD
  // ============================================================================

  @Get('files/list')
  @AllowNoPerm()
  @ApiOperation({ summary: '查询虚拟隔离仓 file 列表' })
  async getFileList(@Query('parentId') parentId: string) {
    const files = await this.ragService.getKnowledgeFileList(Number(parentId) || 0)
    return ResultData.ok(files)
  }

  @Post('folder/create')
  @ApiOperation({ summary: '创建虚拟知识文件夹' })
  async createFolder(@Req() req: any, @Body() dto: { name: string; parentId: number }) {
    if (!req.user || req.user.type !== UserType.SUPER_ADMIN) {
      return ResultData.fail(HttpStatus.FORBIDDEN, '权限不足：仅管理员可创建目录')
    }
    const result = await this.ragService.createFolder(dto.name, Number(dto.parentId) || 0)
    return ResultData.ok(result)
  }

  @Post('file/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '上传并注册语料文件资产' })
  async uploadAndRegisterFile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('parentId') parentId: string,
  ) {
    if (!req.user || req.user.type !== UserType.SUPER_ADMIN) {
      return ResultData.fail(HttpStatus.FORBIDDEN, '权限不足：仅管理员可上传')
    }
    if (!file) {
      return ResultData.fail(HttpStatus.BAD_REQUEST, '未检测到上传文件流')
    }
    const record = await this.ragService.registerPhysicalFile(file, Number(parentId) || 0)
    this.ragService.asyncProcessEtlPipeline(file, record.id)
    return ResultData.ok(record, '文件接收成功，异步清洗任务已激活')
  }

  @Delete('file/delete')
  @ApiOperation({ summary: '物理擦除知识库资产' })
  async deleteFile(@Req() req: any, @Query('id') id: string) {
    if (!req.user || req.user.type !== UserType.SUPER_ADMIN) {
      return ResultData.fail(HttpStatus.FORBIDDEN, '核心资产仅限管理员销毁')
    }
    await this.ragService.deleteFileEntity(Number(id))
    return ResultData.ok(null, '该项语料资产已完成安全下线与销毁')
  }

  // ============================================================================
  // 💬【P1-2】会话与消息
  // ============================================================================

  @Get('sessions')
  @AllowNoPerm()
  @ApiOperation({ summary: '获取当前用户的会话列表（按更新时间倒序）' })
  async listSessions(@Req() req: any) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const list = await this.ragService.listSessions(userId)
    return ResultData.ok(list)
  }

  @Post('sessions')
  @AllowNoPerm()
  @ApiOperation({ summary: '新建一个空会话' })
  async createSession(@Req() req: any, @Body() dto: { title?: string }) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const session = await this.ragService.createSession(userId, dto?.title)
    return ResultData.ok(session)
  }

  @Get('sessions/:id/messages')
  @AllowNoPerm()
  @ApiOperation({ summary: '获取某个会话的全部消息' })
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
  async renameSession(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { title: string },
  ) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const ok = await this.ragService.renameSession(id, userId, dto?.title || '')
    return ok ? ResultData.ok(null, '会话已重命名') : ResultData.fail(HttpStatus.FORBIDDEN, '会话不存在或无权访问')
  }

  @Delete('sessions/:id')
  @AllowNoPerm()
  @ApiOperation({ summary: '删除会话（级联删除消息）' })
  async deleteSession(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const userId = this.resolveUserId(req)
    if (userId === null) return ResultData.fail(HttpStatus.UNAUTHORIZED, '未识别到用户身份')
    const ok = await this.ragService.deleteSession(id, userId)
    return ok ? ResultData.ok(null, '会话已安全下线') : ResultData.fail(HttpStatus.FORBIDDEN, '会话不存在或无权访问')
  }

  // ============================================================================
  // 🔥【P1-2】流式问答（带会话持久化 + 多轮上下文）
  // ============================================================================

  @Post('ask-stream')
  @AllowNoPerm()
  @Keep()
  @ApiOperation({ summary: '首页流式对话问答（自动会话管理 + 多轮记忆）' })
  async askStream(
    @Req() req: any,
    @Body() dto: { question: string; sessionId?: number | string; sources?: number[] },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const userId = this.resolveUserId(req)
    const question = dto.question || ''
    const sessionId = dto.sessionId ?? null
    const sources = dto.sources || []

    try {
      if (userId === null) {
        res.write(`data: ${JSON.stringify(ResultData.fail(401, '未识别到用户身份，请重新登录'))}\n\n`)
        return
      }
      await this.ragService.executeDualTrackQuery(question, sessionId, sources, res, userId)
    } catch (error) {
      console.error('[RAG Controller 顶层防线捕捉]', error)
      const errorMessage = error instanceof Error ? error.message : '服务器内部发生决策性阻断'
      res.write(`data: ${JSON.stringify(ResultData.fail(500, errorMessage))}\n\n`)
    } finally {
      res.write(`data: ${JSON.stringify(ResultData.ok(null, 'stream_ended'))}\n\n`)
      res.end()
    }
  }
}
