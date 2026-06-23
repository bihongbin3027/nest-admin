import { Controller, Get, Post, UploadedFile, UseInterceptors, Query, HttpCode, Body, Req } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger'

import { ResultData } from '../../common/utils/result'

import { OssService } from './oss.service'
import { FindOssDto } from './dto/find-oss.dto'
import { ApiResult } from '../../common/decorators/api-result.decorator'
import { OssEntity } from './oss.entity'

/**
 * 对象存储 Controller
 * - 当前仅提供两个端点：文件上传（POST /oss/upload）、文件列表查询（GET /oss/list）
 * - 路由前缀 /oss
 * - 业务详情见 OssService（重命名 / 落盘 / 写库）
 * - 注：sys_oss 表中的 RAG 轨道字段（ragTrack / vectorStatus / isDir / parentId / associatedTable / fileName）
 *      并非本 Service 写入，而是由 RAG 模块在其自身业务流中更新；上传阶段只填基础字段
 */
@ApiTags('文件存储')
@ApiBearerAuth()
@Controller('oss')
export class OssController {
  constructor(private readonly ossService: OssService) {}

  /**
   * 文件上传（multipart/form-data）
   * - file 字段为二进制文件流
   * - business 字段为可选的业务描述（纯字符串或 JSON 字符串）
   * @param file multer 解析后的文件对象
   * @param params 含 business 业务描述
   * @param req 当前请求（注入 req.user 用于记录上传人）
   */
  @Post('upload')
  @ApiOperation({ summary: '文件上传,返回 url 地址' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          description: '文件',
          type: 'string',
          format: 'binary',
        },
        business: {
          description: '上传文件描述，可以是纯字符串，也可以是JSON字符串',
          type: 'string',
          format: 'text',
        },
      },
    },
  })
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  @ApiResult(OssEntity)
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() params: { business: string },
    @Req() req,
  ): Promise<ResultData> {
    return await this.ossService.create([file], params.business || '', req.user)
  }

  /**
   * 查询文件上传列表（分页 + 时间区间）
   * @param search FindOssDto 含 page / size / startDay / endDay
   */
  @Get('list')
  @ApiOperation({ summary: '查询文件上传列表' })
  @ApiResult(OssEntity, true, true)
  async findList(@Query() search: FindOssDto): Promise<ResultData> {
    return await this.ossService.findList(search)
  }
}
