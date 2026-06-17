import { Module, Global } from '@nestjs/common'
import { RagMetricsService } from './rag-metrics.service'

/**
 * 【P1-1】RAG 业务指标模块
 * - RagMetricsService 全局可见，service 层直接 inject
 * - /metrics 端点由 PrometheusModule 提供（不依赖本模块）
 */
@Global()
@Module({
  providers: [RagMetricsService],
  exports: [RagMetricsService],
})
export class MetricsModule {}