import { ApiProperty } from '@nestjs/swagger'
import {
  IsEmail,
  IsMobilePhone,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsIn,
  IsNumberString,
} from 'class-validator'
import { $enum } from 'ts-enum-util'

import { StatusValue } from '../../../common/enums/common.enum'

/**
 * 用户信息更新 DTO
 * - 所有字段除 id 外均可选；status / roleIds 走 UserService.update 的特殊分支
 * - roleIds 非空时会事务内调用 createOrUpdateUserRole
 */
export class UpdateUserDto {
  /** 目标用户 id（必填） */
  @ApiProperty({ description: '用户编码' })
  @IsNumberString({}, { message: 'id 类型错误，正确类型 string' })
  @IsNotEmpty({ message: 'id 不能为空' })
  readonly id: string

  /** 账号状态：1-有效，0-禁用 */
  @ApiProperty({ description: '所属状态: 1-有效，0-禁用', enum: $enum(StatusValue).getValues(), required: false })
  @IsNumber({}, { message: 'status 类型错误，正确类型 number' })
  @IsOptional()
  @IsIn([StatusValue.NORMAL, StatusValue.FORBIDDEN], { message: 'status 可选值0/1，分别表示有效禁用' })
  readonly status?: StatusValue

  /** 手机号（国内手机号校验） */
  @ApiProperty({ description: '手机号', required: false })
  @IsString({ message: 'phoneNum 类型错误，正确类型 string' })
  @IsMobilePhone('zh-CN', { strictMode: false }, { message: '请输入正确的手机号' })
  // @IsPhoneNumber('CH', { message: '请输入正确的手机号' })
  @IsOptional()
  readonly phoneNum?: string

  /** 邮箱地址 */
  @ApiProperty({ description: '邮箱', required: false })
  @IsString({ message: 'email 类型错误，正确类型 string' })
  @IsEmail()
  @IsOptional()
  readonly email?: string

  /** 头像 URL */
  @ApiProperty({ description: '头像', required: false })
  @IsString({ message: 'avatar 类型错误，正确类型 string' })
  @IsOptional()
  readonly avatar?: string

  /** 角色 id 集合（覆盖式，非空时同步更新用户-角色关系） */
  @ApiProperty({ description: '角色 id 集合', required: false })
  @IsString({ each: true, message: '角色id集合中存在类型错误，正确类型 string[]' })
  @IsOptional()
  readonly roleIds?: string[]
}
