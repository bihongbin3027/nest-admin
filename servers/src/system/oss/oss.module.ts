import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OssController } from './oss.controller'
import { OssService } from './oss.service'
import { OssEntity } from './oss.entity'

/**
 * 对象存储模块 OssModule
 * - 注册 OssEntity 的 Repository
 * - 提供 OssService（落盘 + 写库）与 OssController（/oss 路由）
 * - 与 RAG 模块通过同一张 sys_oss 表共享文件/文件夹元数据
 */
@Module({
  imports: [TypeOrmModule.forFeature([OssEntity])],
  providers: [OssService],
  controllers: [OssController],
})
export class OssModule {}
