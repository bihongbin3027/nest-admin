import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * 用户-部门 多对多关联表（sys_user_dept）
 * - 复合主键由 (id) 承担；同 userId + deptId 不去重，由调用方保证
 * - 关系方向：UserEntity ↔ DeptEntity，目前项目未启用该实体的 Repository，仅作扩展保留
 */
@Entity('sys_user_dept')
export class UserDeptEntity {
  /** 主键 id（bigint，自增） */
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  /** 用户 id */
  @Column({ type: 'bigint', name: 'user_id', comment: '用户id' })
  userId: string

  /** 部门 id */
  @Column({ type: 'bigint', name: 'dept_id', comment: '部门id' })
  deptId: string
}
