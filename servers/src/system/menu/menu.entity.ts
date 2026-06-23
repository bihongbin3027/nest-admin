import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * 菜单实体，对应表 sys_menu
 * - 菜单既表示前端路由（type=1/2）也表示按钮（type=3）
 * - 树形结构由 parentId 字段自引用维护
 * - 与 sys_menu_perm 一对多：一个菜单可以绑定多个接口权限
 */
@Entity('sys_menu')
export class MenuEntity {
  /** 菜单主键 id，bigint 自增 */
  @ApiProperty({ description: 'id' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id: string

  /** 父级菜单 id，0 表示根节点；非 bigint 类型时需做 NumberString 校验 */
  @ApiProperty({ description: '父级菜单id' })
  @Column({ name: 'parent_id', type: 'bigint' })
  public parentId: string

  /** 菜单名称，varchar(30)，前端展示用 */
  @ApiProperty({ description: '菜单名称' })
  @Column({ type: 'varchar', length: 30, comment: '菜单名称' })
  public name: string

  /** 菜单/按钮唯一标识，由前端路由 name 定义，用于控制菜单按钮显隐，varchar(50) */
  @ApiProperty({ description: '菜单/按钮唯一标识,有前端定义,用于控制菜单按钮显隐' })
  @Column({ type: 'varchar', length: 50, comment: '菜单/按钮唯一标识，由前端路由name,用于控制菜单按钮显隐' })
  public code: string

  /** 菜单类型：1-菜单/目录、2-tabs 页、3-按钮 */
  @ApiProperty({ description: '菜单类型, 1-菜单 2-tabs 3-按钮' })
  @Column({ type: 'int', comment: '菜单类型， 1-菜单/目录 2-tabs 3-按钮' })
  public type: 1 | 2 | 3

  /** 排序值，越大越靠前，默认 0 */
  @ApiProperty({ description: '排序' })
  @Column({ name: 'order_num', type: 'int', comment: '排序', default: 0 })
  public orderNum: number
}
