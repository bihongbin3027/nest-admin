import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

import { RagService } from './rag.service'
import { RAG_ETL_QUEUE_NAME, RAG_ETL_JOB_RUN, RagEtlJobData } from './rag-etl.constants'

/**
 * 【P1-2】RAG ETL Processor
 *
 * 消费 BullMQ 队列里的 ETL 任务，调用 RagService 的核心 ETL 逻辑：
 * - concurrency=3 等价于原 SimpleSemaphore(3)
 * - attempts + backoff 由 BullMQ 统一管理（jobs 上配置）
 * - job 失败自动重试 3 次，最终失败落 failed（attempts exhausted）
 *
 * 与 SimpleSemaphore 对比：
 * - ✅ 持久化：进程崩溃后重启，未完成的任务继续执行
 * - ✅ 自动重试：失败任务按指数退避自动重试（无需手动 retry endpoint）
 * - ✅ 可视化：可以用 bull-board 工具查看队列状态
 * - ✅ 多实例：未来部署多实例时共享队列
 * - ❌ 牺牲：ETL 启动延迟从 0ms 变成 ~5-50ms（队列调度开销），可忽略
 */
@Processor(RAG_ETL_QUEUE_NAME, {
  concurrency: 3, // 等价 SimpleSemaphore(3)
})
export class RagFileProcessor extends WorkerHost {
  private readonly logger = new Logger(RagFileProcessor.name)

  constructor(private readonly ragService: RagService) {
    super()
  }

  /**
   * BullMQ Worker 钩子：每个 job 触发一次 process()
   * 抛错 → BullMQ 标记为 failed，按 attempts 策略重试
   */
  async process(job: Job<RagEtlJobData>): Promise<void> {
    const { filePath, fileId, originalName, userId } = job.data
    this.logger.log(
      `[P1-2 ETL Job ${job.id}] 开始 fileId=${fileId} attemptsMade=${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`,
    )

    try {
      // 委托给 RagService 已有的 ETL 核心逻辑（不重复实现）
      await this.ragService.runEtlJob(filePath, fileId, originalName, userId)
      this.logger.log(`[P1-2 ETL Job ${job.id}] 完成 fileId=${fileId}`)
    } catch (err: any) {
      this.logger.error(
        `[P1-2 ETL Job ${job.id}] 失败 fileId=${fileId} attemptsMade=${job.attemptsMade + 1}: ${err?.message}`,
      )
      // 抛出让 BullMQ 走重试逻辑
      throw err
    }
  }
}