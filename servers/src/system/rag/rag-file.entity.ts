import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'

/**
 * RAG 双轨制（VECTOR vs SQL）选择
 * - VECTOR：长文本走向量检索（chunk → embedding → Qdrant）
 * - SQL：结构化表格走行级治理（xlsx/csv 解析 → MySQL 行聚合）
 */
export enum RagTrackEnum {
  SQL = 'sql',
  VECTOR = 'vector',
}

/**
 * 高维向量化 ETL 任务状态机
 * - PENDING：刚上传 / 待入队
 * - PROCESSING：BullMQ 消费者已拉取，正在解析 + embedding
 * - SUCCESS：完成入库，Qdrant 可查
 * - FAILED：失败（错误原因归档到 errorMessage 字段）
 */
export enum VectorStatusEnum {
  PENDING = 'pending', // 未开始 / 待入队
  PROCESSING = 'processing', // 向量化切片中
  SUCCESS = 'success', // 向量化成功
  FAILED = 'failed', // 向量化失败
}

/**
 * RAG 文件/文件夹树节点（表 sys_rag_file）
 *
 * - 既是"文件夹树"也是"文件元数据"——通过 isFolder 区分
 * - parentId = 0 表示根目录；扁平化层级由 parentId 链式表达
 * - 复合索引 (userId, parentId) 支撑"我的目录下文件列表"高频查询
 * - ETL 状态机由 vectorStatus 字段表达，失败原因归档到 errorMessage
 */
@Entity({ name: 'sys_rag_file' })
// 复合索引：按 userId + parentId 查"我的目录下文件"是最高频查询
@Index('IDX_RAG_FILE_USER', ['userId', 'parentId'])
export class RagFileEntity {
  @PrimaryGeneratedColumn({ comment: '主键ID' })
  id: number

  // 文件归属用户ID（企业 SaaS 红线：必须按用户隔离文件）
  // 默认值 1 = 超管兜底（dev/demo 阶段历史数据全部归超管）
  // 复合索引 (userId, parentId) 让"我的目录下文件列表"查询 O(log n)
  @ApiProperty({ description: '所属用户 ID' })
  @Column({ type: 'int', name: 'user_id', default: 1, comment: '所属用户ID（1=SUPER_ADMIN 默认兜底）' })
  userId: number

  @Column({ type: 'varchar', length: 255, comment: '文件/文件夹名称' })
  fileName: string

  @Column({ type: 'int', default: 0, comment: '父级ID，0代表根目录' })
  parentId: number

  @Column({ type: 'tinyint', default: 0, comment: '是否为文件夹：0否，1是' })
  isFolder: number

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '存储在OSS的Key或路径' })
  fileUrl: string

  @Column({ type: 'bigint', default: 0, comment: '文件大小(Byte)' })
  size: number

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '文件后缀名' })
  fileType: string

  @Column({ type: 'enum', enum: RagTrackEnum, default: RagTrackEnum.VECTOR, comment: 'RAG算力轨制' })
  ragTrack: RagTrackEnum

  @Column({ type: 'enum', enum: VectorStatusEnum, default: VectorStatusEnum.PENDING, comment: '高维向量化状态' })
  vectorStatus: VectorStatusEnum

  @Column({ type: 'text', nullable: true, comment: '向量化失败原因归档' })
  errorMessage: string

  // xlsx 真表头行号（智能探测结果）
  // - 默认 1（CSV / 标准无合并 xlsx）
  // - 对"合并标题 + 真表头在 row N"文件，记录 N
  // - 引用预览 / 回溯对齐用
  @ApiProperty({ description: 'xlsx 真表头行号（1-based）' })
  @Column({ type: 'int', nullable: true, name: 'header_row', comment: 'xlsx 真表头行号（智能探测）' })
  headerRow: number | null

  // 文件 sha256 —— 重传去重 / 缓存 key
  @ApiProperty({ description: '文件内容 sha256 哈希（用于去重与缓存命中）' })
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'content_hash', comment: '文件内容 sha256' })
  contentHash: string | null

  // 文件原始修改时间
  @ApiProperty({ description: '文件原始修改时间' })
  @Column({ type: 'datetime', nullable: true, name: 'file_mtime', comment: '文件原始修改时间（来源磁盘 stat）' })
  fileMtime: Date | null

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'create_at', comment: '创建时间' })
  createdAt: Date

  @ApiProperty({ description: '更新时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'update_at', comment: '更新时间' })
  updatedAt: Date
}
