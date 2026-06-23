/**
 * RAG ETL 任务队列常量与类型
 *
 * - 队列名 / Job 名集中定义，避免散落在各处的字符串拼写错误
 * - RagFileProcessor（消费者）与 RagController（生产者）共享同一份常量
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
 * ETL Job payload（生产者在 RagController 入队时构造，消费者在 RagFileProcessor.process 中消费）
 * @property filePath       multer diskStorage 写出的物理文件绝对路径
 * @property fileId         数据库中 RagFileEntity 的主键
 * @property originalName   原始文件名（latin1 字符串，需在 service 内做反向解码）
 * @property userId         上传用户 ID，用于 Qdrant metadata 隔离
 */
export interface RagEtlJobData {
  filePath: string
  fileId: number
  originalName: string
  userId: number
}