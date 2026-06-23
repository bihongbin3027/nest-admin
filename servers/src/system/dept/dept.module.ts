import { TypeOrmModule } from '@nestjs/typeorm'
import { Module } from '@nestjs/common'

import { DeptEntity } from './dept.entity'

import { DeptService } from './dept.service'
import { DeptController } from './dept.controller'

/**
 * 部门模块 DeptModule
 * - 注册 DeptEntity 的 Repository
 * - 提供 DeptService（CRUD）与 DeptController（/dept 路由）
 */
@Module({
  imports: [TypeOrmModule.forFeature([DeptEntity])],
  providers: [DeptService],
  controllers: [DeptController],
  exports: [],
})
export class DeptModule {}
