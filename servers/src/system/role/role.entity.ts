import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 角色实体，对应表 sys_role
 * - 角色是 RBAC 中"用户 → 角色 → 菜单权限"的中间层
 * - 与 sys_menu 的多对多关系通过 sys_role_menu 中间表维护
 * - 与 sys_user 的多对多关系通过 sys_user_role 中间表维护
 */
@Entity('sys_role')
export class RoleEntity {
  /** 角色主键 id，bigint 自增 */
  @ApiProperty({ description: 'id' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  /** 角色名称，varchar(100)，创建/编辑时校验 2~20 字符 */
  @ApiProperty({ description: '角色名称' })
  @Column({ type: 'varchar', length: 100, comment: '角色名称' })
  name: string

  /** 角色备注，varchar(100)，默认空串，可选 0~100 字符 */
  @ApiProperty({ description: '角色备注' })
  @Column({ type: 'varchar', length: 100, default: '', comment: '角色备注' })
  remark: string

  /** 创建时间，由 TypeORM 自动维护（@CreateDateColumn） */
  @CreateDateColumn({ type: 'timestamp', name: 'create_date', comment: '创建时间' })
  @ApiProperty({ description: '创建时间' })
  createDate: Date

  /** 更新时间，由 TypeORM 自动维护（@UpdateDateColumn） */
  @UpdateDateColumn({ type: 'timestamp', name: 'update_date', comment: '更新时间' })
  @ApiProperty({ description: '更新时间' })
  updateDate: Date
}
