import {
  Controller,
  Query,
  Get,
  Param,
  Put,
  Body,
  Post,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  Req,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBody, ApiConsumes, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import type {} from 'multer'

import { UserService } from './user.service'
import { UserRoleService } from './role/user-role.service'
import { UserEntity } from './user.entity'

import { ResultData } from '../../common/utils/result'
import { ApiResult } from '../../common/decorators/api-result.decorator'
import { AllowNoPerm } from '../../common/decorators/perm.decorator'

import { FindUserListDto } from './dto/find-user-list.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { CreateOrUpdateRoleUsersDto } from './dto/createupdate-role-users.dto'
import { UpdateStatusDto } from './dto/update-status.dto'

/**
 * 用户账号 Controller
 * - 提供登录态下的用户账号管理端点（与 base.controller.ts 的注册/登录互为补充）
 * - 列表/详情/角色绑定/状态切换/密码重置/Excel 批量导入
 * - 部分接口通过 @AllowNoPerm() 跳过权限校验（仅做登录态校验）
 */
@ApiTags('用户账号')
@ApiBearerAuth()
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService, private readonly userRoleService: UserRoleService) {}

  /**
   * 查询用户列表（支持分页、模糊搜索、状态过滤、roleId 关联筛选）
   * @param dto FindUserListDto
   */
  @Get('list')
  @ApiOperation({ summary: '查询用户列表' })
  @ApiResult(UserEntity, true, true)
  async findList(@Query() dto: FindUserListDto): Promise<ResultData> {
    return await this.userService.findList(dto)
  }

  /**
   * 根据 id 查询用户信息（未传 id 时回退到当前登录用户）
   * @param id 用户 id（可选）
   */
  @Get('one/info')
  @AllowNoPerm()
  @ApiOperation({ summary: '根据id查询用户信息' })
  @ApiQuery({ name: 'id' })
  @ApiResult(UserEntity)
  async findOne(@Query('id') id: string, @Req() req): Promise<ResultData> {
    return await this.userService.findOne(id || req.user.id)
  }

  /**
   * 查询指定用户拥有的角色 id 集合
   * @param id 用户 id
   */
  @Get(':id/role')
  @ApiOperation({ summary: '查询用户角色id集合' })
  @ApiResult(String, true)
  async findUserRole(@Param('id') id: string): Promise<ResultData> {
    return await this.userRoleService.findUserRole(id)
  }

  /**
   * 角色添加/取消关联用户（批量）
   * @param dto 包含 userIds、roleId、type（create | cancel）
   */
  @Post('role/update')
  @ApiOperation({ summary: '角色添加/取消关联用户' })
  @ApiResult()
  async createOrCancelUserRole(@Body() dto: CreateOrUpdateRoleUsersDto, @Req() req): Promise<ResultData> {
    return await this.userRoleService.createOrCancelUserRole(dto.userIds, dto.roleId, dto.type, req.user.id)
  }

  /**
   * 更新用户基本信息（昵称/手机/邮箱/头像/状态/角色）
   * @param dto UpdateUserDto
   */
  @Put()
  @ApiOperation({ summary: '更新用户信息' })
  @ApiResult()
  async update(@Body() dto: UpdateUserDto, @Req() req): Promise<ResultData> {
    return await this.userService.update(dto, req.user)
  }

  /**
   * 启用/禁用用户
   * @param dto UpdateStatusDto
   */
  @Put('/status/change')
  @ApiOperation({ summary: '更改用户可用状态' })
  @ApiResult()
  async updateStatus(@Body() dto: UpdateStatusDto, @Req() req): Promise<ResultData> {
    return await this.userService.updateStatus(dto.id, dto.status, req.user.id)
  }

  /**
   * 重置用户密码（使用 yml 中配置的初始密码）
   * @param userId 目标用户 id
   */
  @Put('/password/reset/:userId')
  @ApiOperation({ summary: '重置用户密码' })
  @ApiResult()
  async resetPassword(@Param('userId') userId: string, @Req() req): Promise<ResultData> {
    return await this.userService.updatePassword(userId, '', true, req.user)
  }

  /**
   * Excel 批量导入用户（multipart/form-data）
   * @param file 上传的 .xls/.xlsx 文件
   */
  @Post('/import')
  @ApiOperation({ summary: 'excel 批量导入用户' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  @ApiResult(UserEntity, true)
  async importUsers(@UploadedFile() file: Express.Multer.File): Promise<ResultData> {
    return await this.userService.importUsers(file)
  }
}
