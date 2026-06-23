import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BullModule } from '@nestjs/bullmq'

import { RagService } from './rag.service'
import { RagController } from './rag.controller'
import { RagFileProcessor } from './rag-etl.processor'
import { RerankProvider } from './rerank.provider'
import { QdrantHybridProvider } from './qdrant-hybrid.provider'
import { RagFileEntity } from './rag-file.entity'
import { RagSessionEntity } from './rag-session.entity'
import { RagMessageEntity } from './rag-message.entity'

import { UserModule } from '../user/user.module'
import { AuditModule } from '../audit/audit.module'
import { RAG_ETL_QUEUE_NAME } from './rag-etl.constants'

/**
 * RAG 模块装配
 *
 * - providers：
 *   - RagService：核心业务（双轨制 ETL、对话问答、SSE 流式）
 *   - RagFileProcessor：BullMQ 消费者，消费 rag-etl 队列中的 ETL Job
 *   - RerankProvider：向量召回后的 rerank 重排
 *   - QdrantHybridProvider：向量混合检索（dense + sparse）
 * - controllers：RagController 暴露上传、列表、问答、流式问答等 HTTP 端点
 *
 * 队列策略（重要）：
 *   - attempts: 3：失败自动重试 3 次
 *   - backoff 指数退避：2s → 4s → 8s
 *   - removeOnComplete：成功 job 保留 24h 或最新 1000 条
 *   - removeOnFail：失败 job 保留 7 天，便于事后排查
 *   - 实际 concurrency / lockDuration / stalledInterval 见 rag-etl.processor.ts
 */
@Module({
  imports: [
    UserModule,
    AuditModule, // 审计模块：AuditInterceptor 依赖 AuditLogService
    // 注册 RAG ETL 队列（持久化 + 重试 + 并发控制）
    BullModule.registerQueue({
      name: RAG_ETL_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3, // 失败自动重试 3 次
        backoff: { type: 'exponential', delay: 2000 }, // 2s → 4s → 8s
        removeOnComplete: { age: 24 * 3600, count: 1000 }, // 保留 24h
        removeOnFail: { age: 7 * 24 * 3600 }, // 失败保留 7 天便于排查
      },
    }),
    TypeOrmModule.forFeature([RagFileEntity, RagSessionEntity, RagMessageEntity])
  ],
  providers: [RagService, RagFileProcessor, RerankProvider, QdrantHybridProvider],
  controllers: [RagController]
})
export class RagModule {}
