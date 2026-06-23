import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserRoleEntity } from '../user/role/user-role.entity'
import { PermModule } from '../perm/perm.module'

import { RoleController } from './role.controller'
import { RoleService } from './role.service'
import { RoleEntity } from './role.entity'
import { RoleMenuEntity } from './role-menu.entity'

/**
 * 角色模块
 * - 注册 RoleEntity / RoleMenuEntity / UserRoleEntity 三个实体（最后一个负责 user-role 关联）
 * - 引入 PermModule 是因为角色更新/删除后需要调用 PermService.clearUserInfoCache 清理用户权限缓存
 */
@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, RoleMenuEntity, UserRoleEntity]), PermModule],
  providers: [RoleService],
  controllers: [RoleController],
})
export class RoleModule {}
