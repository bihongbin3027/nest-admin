import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { AuthModule } from '../auth/auth.module'
import { PermModule } from '../perm/perm.module'

import { UserEntity } from './user.entity'
import { UserRoleEntity } from './role/user-role.entity'
import { UserDeptEntity } from './dept/user-dept.entity'
import { UserPostEntity } from './post/user-post.entity'

import { UserRoleService } from './role/user-role.service'
import { UserService } from './user.service'

import { BaseController } from './base.controller'
import { UserController } from './user.controller'

/**
 * 用户模块 UserModule
 * - 负责用户、用户-角色、用户-部门、用户-岗位等实体的注册
 * - 注册 JwtModule（异步读取 yml 的 jwt.* 配置），供 UserService.genToken 签发 token
 * - forwardRef(() => AuthModule) 避免 AuthModule 与 UserModule 之间循环依赖
 * - 导出 UserService 供其他模块（如 auth）复用
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, UserRoleEntity, UserDeptEntity, UserPostEntity]),
    forwardRef(() => AuthModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        secret: config.get('jwt.secretkey'),
        signOptions: {
          expiresIn: config.get('jwt.expiresin'),
        },
      }),
      inject: [ConfigService],
    }),
    PermModule,
  ],
  providers: [UserService, UserRoleService],
  controllers: [BaseController, UserController],
  exports: [UserService],
})
export class UserModule {}
