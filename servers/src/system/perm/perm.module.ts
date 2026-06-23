import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { PermService } from './perm.service'
import { PermController } from './perm.controller'

/**
 * 权限模块
 * - 提供用户权限聚合（接口路由 + 菜单树）的查询与缓存失效能力
 * - 引入 HttpModule 是为了在 findAppAllRoutesBySwaggerApi 中抓取 /api/docs-json 反查全量路由
 * - 导出 PermService 供 role / menu / user 等模块在写操作后清理权限缓存
 */
@Module({
  imports: [HttpModule],
  providers: [PermService],
  controllers: [PermController],
  exports: [PermService],
})
export class PermModule {}
