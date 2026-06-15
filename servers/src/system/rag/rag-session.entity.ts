import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { RagMessageEntity } from './rag-message.entity'

/**
 * 【P1-2】RAG 多轮会话主表
 * 一名用户可有 N 个会话，每个会话按 updated_at DESC 排序展示
 */
@Entity({ name: 'sys_rag_session' })
export class RagSessionEntity {
  @ApiProperty({ description: '主键 ID' })
  @PrimaryGeneratedColumn({ comment: '主键ID' })
  id: number

  @ApiProperty({ description: '所属用户 ID' })
  @Column({ type: 'int', name: 'user_id', comment: '所属用户 ID' })
  userId: number

  @ApiProperty({ description: '会话标题（首条消息前 20 字自动生成，可手动改）' })
  @Column({ type: 'varchar', length: 255, default: '新会话', comment: '会话标题' })
  title: string

  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'create_at', comment: '创建时间' })
  createdAt: Date

  @ApiProperty({ description: '更新时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'update_at', comment: '更新时间' })
  updatedAt: Date

  @OneToMany(() => RagMessageEntity, (m) => m.session, { cascade: true })
  messages: RagMessageEntity[]
}
