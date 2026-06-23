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
 * RAG 会话消息流水表（sys_rag_message）
 *
 * - role: 'user' | 'assistant'，仅 assistant 消息会带 citations（引用源 JSON 数组）
 * - 复合索引 (sessionId, createdAt)：按会话顺序回放消息
 * - 与 RagSessionEntity 是多对一（onDelete: 'CASCADE'：会话删 → 消息级联删）
 * - content 用 longtext：assistant 回复可能包含完整 Markdown（含代码块、表格）
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
