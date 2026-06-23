import { Module, Global } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'

import { HealthController } from './health.controller'

/**
 * 健康检查模块
 * - /api/health 综合健康检查
 * - /api/health/live k8s 存活探针
 * - /api/health/ready k8s 就绪探针
 *
 * @Global 让 controller 无需在其它 module 里显式 import
 */
@Global()
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}