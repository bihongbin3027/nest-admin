import { Controller, Post, Body, Get, Put, Delete, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'

import { ApiResult } from '../../common/decorators/api-result.decorator'
import { ResultData } from '../../common/utils/result'

import { MenuService } from './menu.service'
import { MenuEntity } from './menu.entity'
import { MenuPermEntity } from './menu-perm.entity'
import { CreateMenuDto } from './dto/create-menu.dto'
import { UpdateMenuDto } from './dto/update-menu.dto'

/**
 * 菜单与菜单权限 Controller
 * - 提供菜单 CRUD + 菜单-接口权限绑定
 * - 所有写操作完成后 MenuService 会清空 nest:user:* 缓存，保证用户权限实时生效
 */
@ApiTags('菜单与菜单权限管理')
@ApiBearerAuth()
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  /**
   * 获取全部菜单
   * @param hasBtn 是否包含按钮（type=3），1-含 0-不含；缺省按 0 处理
   */
  @Get('/all')
  @ApiOperation({ summary: '得到所有菜单' })
  @ApiResult(MenuEntity, true)
  async findAllMenu(@Query('hasBtn') hasBtn: 0 | 1): Promise<ResultData> {
    return await this.menuService.findAllMenu(!!hasBtn)
  }

  /**
   * 获取指定父菜单下的按钮列表（用于角色编辑页的按钮勾选）
   * @param parentId 父菜单 id
   */
  @Get('one/:parentId/btns')
  @ApiOperation({ summary: '查询单个菜单下的所有按钮' })
  @ApiResult(MenuEntity, true)
  async findBtnByParentId(@Param('parentId') parentId: string): Promise<ResultData> {
    return await this.menuService.findBtnByParentId(parentId)
  }

  /**
   * 获取单个菜单的接口权限（path + method 列表）
   * @param id 菜单 id
   */
  @Get('one/:id/menu-perm')
  @ApiOperation({ summary: '查询单个菜单权限' })
  @ApiResult(MenuPermEntity, true)
  async findMenuPerms(@Param('id') id: string): Promise<ResultData> {
    return await this.menuService.findMenuPerms(id)
  }

  /**
   * 创建菜单（含接口权限批量绑定），由 MenuService 在同一事务内完成
   * @param dto 创建参数（含 menuPermList）
   */
  @Post()
  @ApiOperation({ summary: '创建菜单' })
  @ApiResult()
  async create(@Body() dto: CreateMenuDto): Promise<ResultData> {
    return await this.menuService.create(dto)
  }

  /**
   * 更新菜单基本信息与接口权限；操作完成后清空用户维度缓存
   * @param dto 更新参数
   */
  @Put()
  @ApiOperation({ summary: '更新菜单' })
  @ApiResult()
  async updateMenu(@Body() dto: UpdateMenuDto): Promise<ResultData> {
    return await this.menuService.updateMenu(dto)
  }

  /**
   * 删除菜单（同时删除其接口权限绑定），操作完成后清空用户维度缓存
   * @param id 菜单 id
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除菜单' })
  @ApiResult()
  async delete(@Param('id') id: string): Promise<ResultData> {
    return await this.menuService.deleteMenu(id)
  }
}
