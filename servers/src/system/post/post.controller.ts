import { Controller, Post, Body, Delete, Get, Put, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger'

import { ApiResult } from '../../common/decorators/api-result.decorator'
import { ResultData } from '../../common/utils/result'

import { PostEntity } from './post.entity'
import { PostService } from './post.service'

import { FindPostListDto } from './dto/findPostList.dto'
import { CreatePostDto } from './dto/create-post.dto'
import { UpdatePostDto } from './dto/update-post.dto'

/**
 * 岗位模块 Controller
 * - 提供岗位的 CRUD：create / update / list / detail / delete
 * - 路由前缀 /post
 * - 岗位与部门、用户是多对多关系（中间表 sys_user_post）
 */
@ApiTags('岗位模块')
@ApiBearerAuth()
@Controller('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  /**
   * 创建岗位
   * @param dto CreatePostDto
   */
  @Post()
  @ApiOperation({ summary: '创建岗位' })
  @ApiResult(PostEntity)
  async create(@Body() dto: CreatePostDto): Promise<ResultData> {
    return this.postService.create(dto)
  }

  /**
   * 更新岗位
   * @param dto UpdatePostDto
   */
  @Put()
  @ApiOperation({ summary: '岗位更新' })
  @ApiResult()
  async update(@Body() dto: UpdatePostDto): Promise<ResultData> {
    return this.postService.update(dto)
  }

  /**
   * 查询岗位列表（分页 + 模糊搜索）
   * @param dto FindPostListDto 含 name / code / status 过滤
   */
  @Get('list')
  @ApiOperation({ summary: '查询岗位列表' })
  @ApiResult(PostEntity, true)
  async find(@Query() dto: FindPostListDto): Promise<ResultData> {
    return this.postService.findList(dto)
  }

  /**
   * 查询岗位详情
   * @param id 岗位 id
   */
  @Get(':id')
  @ApiOperation({ summary: '查询岗位详情' })
  @ApiResult(PostEntity)
  async findOne(@Param('id') id: string): Promise<ResultData> {
    return this.postService.findOne(id)
  }

  /**
   * 删除岗位
   * @param id 岗位 id
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除岗位' })
  @ApiResult()
  async delete(@Param('id') id: string): Promise<ResultData> {
    return this.postService.delete(id)
  }
}
