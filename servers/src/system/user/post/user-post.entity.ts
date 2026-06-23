import { PrimaryGeneratedColumn, Column, Entity } from 'typeorm'

/**
 * 用户-岗位 多对多关联表（sys_user_post）
 * - 关系方向：UserEntity ↔ PostEntity，目前项目未启用该实体的 Repository，仅作扩展保留
 */
@Entity('sys_user_post')
export class UserPostEntity {
  /** 主键 id（bigint，自增） */
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  /** 用户 id */
  @Column({ type: 'bigint', name: 'user_id', comment: '用户id' })
  userId: string

  /** 岗位 id */
  @Column({ type: 'bigint', name: 'post_id', comment: '岗位id' })
  postId: string
}
