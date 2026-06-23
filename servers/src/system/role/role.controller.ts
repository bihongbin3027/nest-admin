import { Controller, Get, Post, Put, Param, Delete, Body, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'

import { ResultData } from '../../common/utils/result'
import { ApiResult } from '../../common/decorators/api-result.decorator'

import { RoleService } from './role.service'
import { RoleEntity } from './role.entity'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'

/**
 * 角色模块 Controller
 * - 提供角色的 CRUD 端点，权限粒度由全局 RolesGuard 根据"perm.router.whitelist + 路由权限表"控制
 * - 列表查询对超管和普通用户做了区分（findList 内部按 userType 分支）
 */
@ApiTags('角色模块')
@ApiBearerAuth()
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /**
   * 查询角色列表
   * 超管返回全部角色，普通用户仅返回自己已绑定的角色
   * @param req 请求对象，req.user 由 JwtAuthGuard 注入
   */
  @Get('list')
  @ApiOperation({ summary: '查询 role 列表' })
  @ApiResult(RoleEntity, true)
  async findList(@Req() req): Promise<ResultData> {
    return await this.roleService.findList(req.user.type, req.user.id)
  }

  /**
   * 查询单个角色所拥有的菜单 id 列表（用于编辑回显）
   * @param id 角色 id
   */
  @Get('one/:id/perms')
  @ApiOperation({ summary: '查询单个角色详情及权限菜单' })
  @ApiResult(RoleEntity)
  async findOne(@Param('id') id: string): Promise<ResultData> {
    return await this.roleService.findOnePerm(id)
  }

  /**
   * 创建角色并绑定菜单（以及创建者-角色的关联）
   * @param dto 角色创建参数（含 menuIds）
   * @param req 请求对象，req.user 由 JwtAuthGuard 注入
   */
  @Post()
  @ApiOperation({ summary: '创建角色' })
  @ApiResult(RoleEntity)
  async create(@Body() dto: CreateRoleDto, @Req() req): Promise<ResultData> {
    return await this.roleService.create(dto, req.user)
  }

  /**
   * 更新角色基本信息（name/remark/menuIds），操作完成后由 Service 清理权限缓存
   * @param dto 更新参数
   */
  @Put()
  @ApiOperation({ summary: '更新角色' })
  @ApiResult()
  async update(@Body() dto: UpdateRoleDto): Promise<ResultData> {
    return await this.roleService.update(dto)
  }

  /**
   * 删除角色（需先解除所有用户绑定），操作完成后清空所有用户权限缓存
   * @param id 角色 id
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除角色' })
  @ApiResult()
  async delete(@Param('id') id: string): Promise<ResultData> {
    return await this.roleService.delete(id)
  }
}
