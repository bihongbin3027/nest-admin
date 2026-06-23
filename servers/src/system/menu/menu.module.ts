import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { PermModule } from '../perm/perm.module'

import { MenuPermEntity } from './menu-perm.entity'
import { MenuEntity } from './menu.entity'
import { MenuController } from './menu.controller'
import { MenuService } from './menu.service'

/**
 * 菜单模块
 * - 注册 MenuEntity / MenuPermEntity 两个实体
 * - 引入 PermModule 是因为菜单的增删改会影响所有用户的菜单与接口权限，需要清空 nest:user:* 缓存
 */
@Module({
  imports: [TypeOrmModule.forFeature([MenuEntity, MenuPermEntity]), PermModule],
  providers: [MenuService],
  controllers: [MenuController],
})
export class MenuModule {}
