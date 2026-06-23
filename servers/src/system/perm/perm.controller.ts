import { Controller, Get, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'

import { ApiResult } from '../../common/decorators/api-result.decorator'
import { AllowNoPerm } from '../../common/decorators/perm.decorator'
import { ResultData } from '../../common/utils/result'

import { MenuEntity } from '../menu/menu.entity'

import { PermService } from './perm.service'
import { RouteDto } from './dto/route.dto'

/**
 * 权限路由 Controller
 * - 提供三个端点：获取应用全部路由、当前用户接口权限、当前用户菜单树
 * - 前两个端点受全局 RolesGuard 管控；菜单端点用 @AllowNoPerm() 跳过接口级权限校验（仅要求登录）
 */
@ApiTags('权限路由')
@ApiBearerAuth()
@Controller('perm')
export class PermController {
  constructor(private readonly permService: PermService) {}

  /**
   * 获取应用全部 API 路由（来自 Swagger 文档）
   * 用于角色管理页"权限分配"下拉框，无需登录态以外的额外权限
   */
  @Get('all')
  @ApiOperation({ summary: '获取app 所有路由' })
  @ApiResult(RouteDto)
  async findAppAllRoutes(): Promise<ResultData> {
    return await this.permService.findAppAllRoutes()
  }

  /**
   * 获取当前登录用户拥有的接口权限列表（method + path）
   * 供前端路由守卫比对，允许请求放行
   * @param req 请求对象，req.user 由 JwtAuthGuard 注入
   */
  @Get('user')
  @ApiOperation({ summary: '获取用户权限所有接口路由列表' })
  @ApiResult(RouteDto, true)
  async findUserRoutes(@Req() req): Promise<ResultData> {
    const appRoutes = await this.permService.findUserPerms(req.user.id)
    return ResultData.ok(appRoutes)
  }

  /**
   * 获取当前登录用户的菜单权限树
   * 用 @AllowNoPerm() 跳过 RolesGuard，因为菜单数据本身就需要让所有登录用户可见
   * @param req 请求对象，req.user 由 JwtAuthGuard 注入
   */
  @Get('menu')
  @AllowNoPerm()
  @ApiOperation({ summary: '用户权限' })
  @ApiResult(MenuEntity, true)
  async findUser(@Req() req): Promise<ResultData> {
    const menuPerms = await this.permService.findUserMenus(req.user.id, req.user.type)
    return ResultData.ok(menuPerms)
  }
}
