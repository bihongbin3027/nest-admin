/**
 * 【P1-2】RAG ETL 任务队列常量与类型
 *
 * 队列名 / Job 名集中定义，避免散落在各处的字符串拼写错误
 */

/**
 * BullMQ Queue 名
 */
export const RAG_ETL_QUEUE_NAME = 'rag-etl' as const

/**
 * Job 名（同一 Queue 可承载多种 Job 类型）
 */
export const RAG_ETL_JOB_RUN = 'run-etl' as const

/**
 * ETL Job payload
 */
export interface RagEtlJobData {
  filePath: string
  fileId: number
  originalName: string
  userId: number
}