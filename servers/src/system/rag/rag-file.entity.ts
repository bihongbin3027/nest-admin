import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'

export enum RagTrackEnum {
  SQL = 'sql',
  VECTOR = 'vector',
}

export enum VectorStatusEnum {
  PENDING = 'pending', // 未开始 / 待入队
  PROCESSING = 'processing', // 向量化切片中
  SUCCESS = 'success', // 向量化成功
  FAILED = 'failed', // 向量化失败
}

@Entity({ name: 'sys_rag_file' })
// 【P0-1】复合索引：按 userId + parentId 查"我的目录下文件"是最高频查询
@Index('IDX_RAG_FILE_USER', ['userId', 'parentId'])
export class RagFileEntity {
  @PrimaryGeneratedColumn({ comment: '主键ID' })
  id: number

  // 【P0-1】文件归属用户ID（企业 SaaS 红线：必须按用户隔离文件）
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

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'create_at', comment: '创建时间' })
  createdAt: Date

  @ApiProperty({ description: '更新时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'update_at', comment: '更新时间' })
  updatedAt: Date
}
