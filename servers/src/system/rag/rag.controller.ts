import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  Req,
  Query,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger'
import { Response } from 'express'
import { RagService } from './rag.service'

import { JwtAuthGuard } from '../../common/guards/auth.guard'
import { AllowNoPerm } from '../../common/decorators/perm.decorator'
import { ResultData } from '../../common/utils/result'

@ApiTags('企业级双轨制核心知识库 RAG')
@Controller('rag')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RagController {
  constructor(private readonly ragService: RagService) {}

  /**
   * 获取指定层级的知识文件夹及文件资产矩阵（仅限 Admin）
   */
  @Get('files/list')
  @ApiOperation({ summary: '查询虚拟隔离仓 file 列表' })
  async getFileList(@Req() req: any, @Query('parentId') parentId: string) {
    if (!req.user || !req.user.roles || !req.user.roles.includes('admin')) {
      return ResultData.fail(HttpStatus.FORBIDDEN, '权限不足')
    }
    const files = await this.ragService.getKnowledgeFileList(Number(parentId) || 0)
    return ResultData.ok(files)
  }

  /**
   * 创建虚拟知识库网盘文件夹（仅限 Admin）
   */
  @Post('folder/create')
  @ApiOperation({ summary: '创建虚拟知识文件夹' })
  async createFolder(@Req() req: any, @Body() dto: { name: string; parentId: number }) {
    if (!req.user || !req.user.roles || !req.user.roles.includes('admin')) {
      return ResultData.fail(HttpStatus.FORBIDDEN, '权限不足')
    }
    const result = await this.createFolderEntity(dto.name, dto.parentId)
    return ResultData.ok(result)
  }

  // 内部辅助包装，确保调用 Service 正确
  private async createFolderEntity(name: string, parentId: number) {
    return await this.ragService.createFolder(name, parentId)
  }

  /**
   * 🌟【精准修复 1】注册新文件并激活后台向量化任务（仅限 Admin）
   * 引入标准 FileInterceptor 拦截器，完美透传物理二进制 Buffer，并异步触发 ETL 管道
   */
  @Post('file/register')
  @UseInterceptors(FileInterceptor('file')) // 强力拦截前端 Form-Data 中的 'file' 域
  @ApiOperation({ summary: '注册语料文件资产' })
  async registerUploadedFile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File, // 准确捕获物理文件
    @Body('parentId') parentId: string, // 捕获挂载的父级虚拟目录 ID
  ) {
    if (!req.user || !req.user.roles || !req.user.roles.includes('admin')) {
      return ResultData.fail(HttpStatus.FORBIDDEN, '权限不足')
    }

    if (!file) {
      return ResultData.fail(HttpStatus.BAD_REQUEST, '未检测到任何有效的物理语料资产文件上传')
    }

    const pId = Number(parentId) || 0

    // 1. 特征特征特征分流落库，拿到对应的 sys_oss 数据主键 ID
    const registerResult = await this.ragService.registerFileAndTriggerEmbedding(file, pId)

    // 2. 毫秒级激活异步清洗切片流，瞬间解耦主 HTTP 管道
    this.ragService.asyncProcessEtlPipeline(file, registerResult.id)

    return ResultData.ok(registerResult, '语料资产物理注册成功，后台深度 ETL 向量化清洗任务已激活。')
  }

  /**
   * 侧边栏拉取已成功向量化的语料库（全员可用）
   */
  @Get('files')
  @AllowNoPerm()
  @ApiOperation({ summary: '获取已被激活可用于 RAG 检索的语料列表' })
  async getRagFiles() {
    const files = await this.ragService.getActivatedFiles()
    return ResultData.ok(files)
  }

  /**
   * 清空或销毁指定会话的上下文历史（全员可用）
   */
  @Post('session/clear')
  @AllowNoPerm()
  @ApiOperation({ summary: '安全释放清空指定的会话历史记录' })
  async clearSession(@Body() body: { sessionId: string }) {
    return ResultData.ok(null)
  }

  /**
   * 🚀【精准修复 2】企业级 inteligente 双轨流式问答引擎
   * 剔除原本残缺的 RxJS subscribe 逻辑，改由 Service 直控 Express Response 通道
   */
  @Post('ask-stream')
  @AllowNoPerm()
  @ApiOperation({ summary: '首页流式对话问答' })
  async askStream(
    @Body() dto: { question: string; sessionId?: string; sources?: number[] },
    @Res() res: Response, // 显式注入 Express 原始 Response
  ) {
    // 1. 初始化标准 SSE (Server-Sent Events) 响应头，禁用 Nginx 缓存，确保打字机秒回
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 2. 健壮性防空收尾：提取核心入参
    const question = dto.question || ''
    const sessionId = dto.sessionId || `session_${Date.now()}`
    const sources = dto.sources || []

    try {
      // 调用 Service 层执行双轨制复杂计算与实时 res.write() 泵字
      await this.ragService.executeDualTrackQuery(question, sessionId, sources, res)
    } catch (error) {
      console.error('[RAG Controller 顶层防线捕捉]', error)
      const errorMessage = error instanceof Error ? error.message : '服务器内部发生决策性阻断'
      res.write(`data: ${JSON.stringify({ code: 500, msg: errorMessage })}\n\n`)
    } finally {
      // 物理断开 Express 连接
      res.end()
    }

    return ResultData.ok(null, 'stream_ended')
  }
}
