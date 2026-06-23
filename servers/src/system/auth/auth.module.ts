import { forwardRef, Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'

import { UserModule } from '../user/user.module'

import { AuthService } from './auth.service'
import { AuthStrategy } from './auth.strategy'

/**
 * 鉴权模块
 * - 注册 Passport 默认策略为 jwt
 * - 通过 forwardRef 打破与 UserModule 的循环依赖（AuthService 依赖 UserService，UserService 又通过 PermService 间接依赖）
 * - 导出 PassportModule 以便其他模块通过 @UseGuards(AuthGuard('jwt')) 使用 JWT 鉴权
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    forwardRef(() => UserModule), // 模块间循环依赖处理
  ],
  providers: [AuthService, AuthStrategy],
  exports: [PassportModule, AuthService],
})
export class AuthModule {}
