import { Body, Controller, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'

import { ResultData } from '../../common/utils/result'
import { AllowAnon } from '../../common/decorators/allow-anon.decorator'
import { AllowNoPerm } from '../../common/decorators/perm.decorator'
import { ApiResult } from '../../common/decorators/api-result.decorator'

import { UserEntity } from './user.entity'
import { UserService } from './user.service'

import { LoginUser } from './dto/login-user.dto'
import { CreateUserDto } from './dto/create-user.dto'
import { CreateTokenDto } from './dto/create-token.dto'

/**
 * 基础账户 Controller（注册 / 登录 / 刷新 token）
 * - @Controller() 无路由前缀，三个端点分别为 /register、/login、/update/token
 * - 注册/登录走 @AllowAnon() 跳过全局 JwtAuthGuard
 * - 刷新 token 走 @AllowNoPerm() 跳过接口级权限校验（仅要求登录）
 * - 业务实现全部委派给 UserService
 */
@ApiTags('登录注册')
@Controller()
export class BaseController {
  constructor(private readonly userService: UserService) {}

  /**
   * 用户注册
   * @param user CreateUserDto 注册信息（账号、密码、手机/邮箱、确认密码、头像）
   */
  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  @ApiResult(UserEntity)
  @AllowAnon()
  async create(@Body() user: CreateUserDto): Promise<ResultData> {
    return await this.userService.create(user)
  }

  /**
   * 用户登录（account 可以是账号/手机/邮箱）
   * @param dto LoginUser
   */
  @Post('login')
  @ApiOperation({ summary: '登录' })
  @ApiResult(CreateTokenDto)
  @AllowAnon()
  async login(@Body() dto: LoginUser): Promise<ResultData> {
    return await this.userService.login(dto.account, dto.password)
  }

  /**
   * 刷新 token（基于当前登录用户重新签发 access/refresh）
   */
  @Post('/update/token')
  @ApiOperation({ summary: '刷新token' })
  @ApiResult(CreateTokenDto)
  @AllowNoPerm()
  @ApiBearerAuth()
  async updateToken(@Req() req): Promise<ResultData> {
    return await this.userService.updateToken(req.user.id)
  }
}
