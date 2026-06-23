import { ApiProperty } from '@nestjs/swagger'
import { PrimaryGeneratedColumn, Column, CreateDateColumn, Entity } from 'typeorm'
import { $enum } from 'ts-enum-util'

import { StatusValue } from '../../common/enums/common.enum'

/**
 * 部门实体（sys_dept 表）
 * - 树形结构：parentId 为 '0' 表示根部门，否则指向父部门 id
 * - 后端返回扁平列表，部门树由前端根据 parentId 递归组装
 * - orderNum 用于同级部门排序（数字越大越靠前）
 */
@Entity('sys_dept')
export class DeptEntity {
  /** 主键 id（bigint，自增） */
  @ApiProperty({ description: 'id' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  /** 父级部门 id，'0' 表示根部门 */
  @ApiProperty({ description: '上级部门 id' })
  @Column({ type: 'bigint', name: 'parent_id', comment: '父级部门 id' })
  parentId: string

  /** 部门名称 */
  @ApiProperty({ description: '部门名称' })
  @Column({ type: 'varchar', length: 50, comment: '部门名称' })
  name: string

  /** 部门状态：1-有效，0-禁用 */
  @ApiProperty({ description: '状态', enum: $enum(StatusValue).getValues() })
  @Column({ type: 'tinyint', default: StatusValue.NORMAL, comment: '部门状态，1-有效，0-禁用' })
  status: StatusValue

  /** 同级排序（前端按 desc 展示） */
  @ApiProperty({ description: '排序' })
  @Column({ name: 'order_num', type: 'int', comment: '排序', default: 0 })
  orderNum: number

  /** 部门负责人姓名 */
  @ApiProperty({ description: '部门负责人' })
  @Column({ type: 'varchar', length: 50, comment: '部门负责人' })
  leader: string

  /** 备注（text 可存长文本） */
  @ApiProperty({ description: '备注' })
  @Column({ type: 'text', comment: '备注' })
  remark: string

  /** 创建时间（TypeORM 自动填充） */
  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'create_date', comment: '创建时间' })
  createDate: Date
}
