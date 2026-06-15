import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { RagSessionEntity } from './rag-session.entity'

/**
 * 【P1-2】RAG 会话消息流水表
 * role: 'user' | 'assistant'
 * citations: 引用源 JSON 数组，仅 assistant 消息有
 */
@Entity({ name: 'sys_rag_message' })
@Index('IDX_RAG_MSG_SESSION', ['sessionId', 'createdAt'])
export class RagMessageEntity {
  @ApiProperty({ description: '主键 ID' })
  @PrimaryGeneratedColumn({ comment: '主键ID' })
  id: number

  @ApiProperty({ description: '所属会话 ID' })
  @Column({ type: 'int', name: 'session_id', comment: '所属会话 ID' })
  sessionId: number

  @ApiProperty({ description: '角色', enum: ['user', 'assistant'] })
  @Column({ type: 'varchar', length: 20, comment: '角色: user | assistant' })
  role: 'user' | 'assistant'

  @ApiProperty({ description: '消息正文（Markdown）' })
  @Column({ type: 'longtext', comment: '消息正文' })
  content: string

  @ApiProperty({ description: '引用源列表（仅 assistant 消息）', required: false })
  @Column({ type: 'json', nullable: true, comment: '引用源列表 JSON' })
  citations: any | null

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'create_at', comment: '创建时间' })
  createdAt: Date

  @ManyToOne(() => RagSessionEntity, (s) => s.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: RagSessionEntity
}
