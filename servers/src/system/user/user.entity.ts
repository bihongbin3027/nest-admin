import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude } from 'class-transformer'
import { $enum } from 'ts-enum-util'

import { UserType, StatusValue } from '../../common/enums/common.enum'

/**
 * 用户实体（sys_user 表）
 * - 存储系统登录用户的账号、密码（bcrypt hash + salt）、手机/邮箱、状态、类型等核心字段
 * - password / salt 字段用 @Exclude({ toPlainOnly: true }) 屏蔽序列化输出
 * - createDate / updateDate 由 TypeORM 自动维护
 */
@Entity('sys_user')
export class UserEntity {
  /** 主键 id（bigint，自增） */
  @ApiProperty({ type: String, description: 'id' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id: string

  /** 登录密码（bcrypt 哈希），输出时屏蔽 */
  @Exclude({ toPlainOnly: true }) // 输出屏蔽密码
  @Column({ type: 'varchar', length: 200, nullable: false, comment: '用户登录密码' })
  public password: string

  /** 密码加盐值，输出时屏蔽 */
  @Exclude({ toPlainOnly: true }) // 输出屏蔽盐
  @Column({ type: 'varchar', length: 200, nullable: false, comment: '盐' })
  public salt: string

  /** 用户登录账号（唯一） */
  @ApiProperty({ type: String, description: '用户登录账号' })
  @Column({ type: 'varchar', length: 32, comment: '用户登录账号' })
  public account: string

  /** 用户手机号（列名 phone_num，可空） */
  @ApiProperty({ type: String, description: '手机号' })
  @Column({ type: 'varchar', name: 'phone_num', default: '', length: 20, comment: '用户手机号码' })
  public phoneNum: string

  /** 邮箱地址（可空） */
  @ApiProperty({ type: String, description: '邮箱' })
  @Column({ type: 'varchar', comment: '邮箱地址', default: '' })
  public email: string

  /** 账号状态：1-有效，0-禁用 */
  @ApiProperty({ type: String, description: '所属状态: 1-有效，0-禁用', enum: $enum(StatusValue).getValues() })
  @Column({ type: 'tinyint', default: StatusValue.NORMAL, comment: '所属状态: 1-有效，0-禁用' })
  public status: StatusValue

  /** 头像 URL */
  @ApiProperty({ type: String, description: '头像url' })
  @Column({ type: 'varchar', comment: '头像地址' })
  public avatar: string

  /** 账号类型：0-超管，1-普通用户 */
  @ApiProperty({ type: Number, description: '帐号类型：0-超管， 1-普通用户', enum: $enum(UserType).getValues() })
  @Column({ type: 'tinyint', default: UserType.ORDINARY_USER, comment: '帐号类型：0-超管， 1-普通用户' })
  public type: UserType

  /** 创建时间（TypeORM 自动填充） */
  @ApiProperty({ type: Date, description: '创建时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'create_date', comment: '创建时间' })
  createDate: Date

  /** 更新时间（TypeORM 自动填充） */
  @ApiProperty({ type: Date, description: '更新时间' })
  @UpdateDateColumn({ type: 'timestamp', name: 'update_date', comment: '更新时间' })
  updateDate: Date
}
