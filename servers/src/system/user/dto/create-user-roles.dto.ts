import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsNumberString } from 'class-validator'

/**
 * 给指定用户一次性设置角色集合（先删后写）
 * - UserService.createOrUpdateUserRole / UserService.update 使用
 */
export class CreateOrUpdateUserRolesDto {
  /** 目标用户 id */
  @ApiProperty({ description: '用户id' })
  @IsNumberString({}, { message: 'userId 类型错误，正确类型 string' })
  @IsNotEmpty({ message: 'userId 不能为空' })
  userId: string

  /** 要设置的角色 id 集合（覆盖式） */
  @ApiProperty({ description: '角色id 集合' })
  @IsNumberString({}, { each: true, message: '角色id集合中存在类型错误，正确类型 string[]' })
  @IsNotEmpty({ each: true, message: '角色id集合中存在为空' })
  roleIds: string[]
}
