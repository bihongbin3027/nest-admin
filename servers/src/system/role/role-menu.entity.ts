import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * 角色-菜单 多对多关联表，对应 sys_role_menu
 * - 用于把"角色"和"菜单/按钮"绑定起来；用户的最终权限由 user_role + role_menu 推导
 * - 角色创建/更新时由 RoleService 在同一事务内写入或重写本表记录
 */
@Entity('sys_role_menu')
export class RoleMenuEntity {
  /** 关联主键，bigint 自增 */
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  /** 角色 id，关联 sys_role.id，非空 */
  @Column({ type: 'bigint', name: 'role_id', comment: '角色 id' })
  roleId: string

  /** 菜单 id，关联 sys_menu.id，非空 */
  @Column({ type: 'bigint', name: 'menu_id', comment: '菜单 id' })
  menuId: string
}
