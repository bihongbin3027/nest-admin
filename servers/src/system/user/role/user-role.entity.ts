import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * 用户-角色 多对多关联表（sys_user_role）
 * - 关系方向：UserEntity ↔ RoleEntity
 * - 一行代表一个「用户-拥有-角色」三元关系
 * - UserRoleService.createOrUpdateUserRole / createOrCancelUserRole 操作该表
 */
@Entity('sys_user_role')
export class UserRoleEntity {
  /** 主键 id（bigint，自增） */
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  /** 用户 id */
  @Column({ type: 'bigint', name: 'user_id', comment: '用户id' })
  userId: string

  /** 角色 id */
  @Column({ type: 'bigint', name: 'role_id', comment: '角色id' })
  roleId: string
}
