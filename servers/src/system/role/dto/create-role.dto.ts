import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length, IsOptional, IsArray, IsNumber, IsNotEmpty } from 'class-validator'

/**
 * 创建角色请求 DTO
 * - 由 POST /role 接收
 * - 通过 class-validator 校验后由 RoleService.create 在同一事务内写入角色与角色-菜单关联
 */
export class CreateRoleDto {
  /** 角色名称，必填，2~20 字符 */
  @ApiProperty({ description: '角色名称' })
  @IsString({ message: 'name 类型错误, 正确类型 string' })
  @IsNotEmpty({ message: 'name 不能为空' })
  @Length(2, 20, { message: 'name 字符长度在 2~20' })
  name: string

  /** 角色备注，可选，0~100 字符，默认空串 */
  @ApiProperty({ description: '角色备注', required: false })
  @IsString({ message: 'remark 类型错误, 正确类型 string' })
  @Length(0, 100, { message: 'remark 字符长度在 0~100' })
  @IsOptional()
  remark?: string

  /** 当前角色所授权的菜单 id 列表，必填，元素为菜单主键 */
  @ApiProperty({ description: '当前角色所拥有的菜单组' })
  @IsArray({ message: 'menuIds 类型错误，正确类型 string[]' })
  @IsString({ each: true, message: '菜单组内类型错误' })
  @IsNotEmpty({ each: true, message: '菜单id 不能为空' })
  menuIds: string[]
}
