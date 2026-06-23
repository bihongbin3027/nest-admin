import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { $enum } from 'ts-enum-util'

import { StatusValue } from '../../common/enums/common.enum'

/**
 * 岗位实体（sys_post 表）
 * - 与用户多对多（中间表 sys_user_post）
 * - code 业务唯一编码（创建时与 name 联合查重）
 * - orderNum 用于列表排序（按 desc）
 */
@Entity('sys_post')
export class PostEntity {
  /** 主键 id（bigint，自增） */
  @ApiProperty({ description: 'id' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string

  /** 岗位编码（业务唯一，1-50 字符） */
  @ApiProperty({ description: '岗位编码' })
  @Column({ type: 'varchar', length: 50, comment: '岗位编码' })
  code: string

  /** 岗位名称 */
  @ApiProperty({ description: '岗位名称' })
  @Column({ type: 'varchar', length: 50, comment: '岗位名称' })
  name: string

  /** 岗位状态：1-有效，0-禁用 */
  @ApiProperty({ description: '状态', enum: $enum(StatusValue).getValues() })
  @Column({ type: 'tinyint', default: StatusValue.NORMAL, comment: '岗位状态，1-有效，0-禁用' })
  status: StatusValue

  /** 备注（text，可空） */
  @ApiProperty({ description: '备注' })
  @Column({ type: 'text', default: null, comment: '备注' })
  remark: string

  /** 列表排序（数字越大越靠前） */
  @ApiProperty({ description: '排序' })
  @Column({ name: 'order_num', type: 'int', comment: '排序', default: 0 })
  orderNum: number

  /** 创建时间（TypeORM 自动填充） */
  @ApiProperty({ description: '创建时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'create_date', comment: '创建时间' })
  createDate: Date
}
