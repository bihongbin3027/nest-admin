import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

import { RagService } from './rag.service'
import { RAG_ETL_QUEUE_NAME, RAG_ETL_JOB_RUN, RagEtlJobData } from './rag-etl.constants'

/**
 * RAG ETL 队列消费者
 *
 * - 职责：消费 rag-etl 队列里的 ETL Job，委托给 RagService.runEtlJob 执行
 * - concurrency=3：等价于原 SimpleSemaphore(3)，控制 ETL 并发上限
 * - 失败处理：抛错让 BullMQ 走 attempts + 指数退避策略（最多 3 次：2s → 4s → 8s）
 * - 关键调参（必须显式拉大，避免 Windows + onnxruntime 启动慢导致的 stalled 误判）：
 *   - lockDuration: 300000 (5 分钟)
 *   - stalledInterval: 60000 (1 分钟)
 *
 * @see 文件顶部模块级注释：详细解释 lockDuration / stalledInterval 调参原因
 */
@Processor(RAG_ETL_QUEUE_NAME, {
  concurrency: 3, // 等价 SimpleSemaphore(3)
  lockDuration: 300000, // 5 分钟：远超实际 ETL 耗时（embedding + 入库通常 < 30s）
  stalledInterval: 60000, // 1 分钟检查一次
})
export class RagFileProcessor extends WorkerHost {
  private readonly logger = new Logger(RagFileProcessor.name)

  constructor(private readonly ragService: RagService) {
    super()
  }

  /**
   * 监听 Worker 关键事件：
   * - 'error' 捕获所有 BullMQ 内部错误
   * - 'failed' 监控 job 失败原因（特别是 "stalled" 误判时及时告警）
   */
  @OnWorkerEvent('error')
  onError(err: Error) {
    this.logger.error(`[RagFileProcessor] Worker error: ${err?.message || err}`, err?.stack)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RagEtlJobData> | undefined, err: Error) {
    this.logger.error(
      `[RagFileProcessor] job failed jobId=${job?.id} fileId=${job?.data?.fileId} attemptsMade=${job?.attemptsMade} err=${err?.message}`,
    )
  }

  /**
   * BullMQ Worker 钩子：每个 job 触发一次 process()
   * 抛错 → BullMQ 标记为 failed，按 attempts 策略重试
   */
  async process(job: Job<RagEtlJobData>): Promise<void> {
    const { filePath, fileId, originalName, userId } = job.data
    this.logger.log(
      `[RagFileProcessor] 开始 ETL fileId=${fileId} attemptsMade=${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`,
    )

    try {
      // 委托给 RagService 已有的 ETL 核心逻辑（不重复实现）
      await this.ragService.runEtlJob(filePath, fileId, originalName, userId)
      this.logger.log(`[RagFileProcessor] 完成 ETL fileId=${fileId}`)
    } catch (err: any) {
      this.logger.error(
        `[RagFileProcessor] ETL 失败 fileId=${fileId} attemptsMade=${job.attemptsMade + 1}: ${err?.message}`,
      )
      // 抛出让 BullMQ 走重试逻辑
      throw err
    }
  }
}