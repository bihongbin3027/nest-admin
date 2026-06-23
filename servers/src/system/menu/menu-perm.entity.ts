import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 菜单-接口权限关联表，对应 sys_menu_perm
 * - 描述"一个菜单可以调用哪些后端接口"
 * - 与 sys_role_menu + sys_user_role 串联后，用户实际可访问的接口 = user_role → role_menu → menu_perm
 */
@Entity('sys_menu_perm')
export class MenuPermEntity {
  /** 关联主键，bigint 自增 */
  @ApiProperty({ description: 'id' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id: string

  /** 所属菜单 id，关联 sys_menu.id */
  @ApiProperty({ description: '菜单id' })
  @Column({ type: 'bigint', name: 'menu_id', comment: '菜单id' })
  public menuId: string

  /** 该菜单所能调用的后端接口路径；必须是本应用接口，否则设置了也不生效 */
  @ApiProperty({ description: 'api 路径' })
  @Column({ name: 'api_url', comment: '该菜单所能调用的 api 接口，必须是本应用的接口，否则设置了也不生效' })
  public apiUrl: string

  /** 该菜单所能调用接口的 HTTP 方法（GET/POST/PUT/DELETE） */
  @ApiProperty({ description: 'api 方法' })
  @Column({ name: 'api_method', comment: '该菜单所能调用 api 接口的 method 方法' })
  public apiMethod: string
}
