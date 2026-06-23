import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, IsNotEmpty, IsString, IsIn } from 'class-validator'

/**
 * 角色批量绑定/解绑用户 DTO
 * - 单角色 + 多用户维度
 * - UserRoleService.createOrCancelUserRole 使用
 * - type = create 批量插入；type = cancel 按 (roleId, userIds) 批量删除
 */
export class CreateOrUpdateRoleUsersDto {
  /** 目标用户 id 集合 */
  @ApiProperty({ description: 'user id 集合' })
  @IsString({ each: true, message: 'userIds 集合中有类型错误' })
  @IsNotEmpty({ message: 'userIds 不能为空' })
  userIds: string[]

  /** 角色 id */
  @ApiProperty({ description: '角色 roleId' })
  @IsString({ message: 'roleId 类型错误，正确类型 number' })
  @IsNotEmpty({ message: 'roleId 不能为空' })
  roleId: string

  /** 操作类型：create 添加关联，cancel 取消关联 */
  @ApiProperty({ description: 'create/cancel', enum: ['create', 'cancel'] })
  @IsString({ message: 'type 类型错误，正确类型 string' })
  @IsIn(['create', 'cancel'], { message: '可选值为 create / cancel' })
  type: 'create' | 'cancel'
}
