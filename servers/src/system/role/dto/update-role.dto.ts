import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, IsString, Length, IsNotEmpty, IsOptional, IsArray } from 'class-validator'

/**
 * 更新角色请求 DTO
 * - 由 PUT /role 接收
 * - 所有业务字段均可选，RoleService.update 仅对传入字段执行更新；menuIds 为"全量替换"语义
 */
export class UpdateRoleDto {
  /** 角色主键 id，必填 */
  @ApiProperty({ description: 'id' })
  @IsString({ message: 'id 类型错误，正确类型 number' })
  @IsNotEmpty({ message: 'id 不能为空' })
  id: string

  /** 角色名称，可选；传入时校验 2~20 字符 */
  @ApiProperty({ description: '角色名称' })
  @IsString({ message: 'remark 类型错误, 正确类型 string' })
  @Length(2, 20, { message: 'name 字符长度在 2~20' })
  name?: string

  /** 角色备注，可选；传入时校验 0~100 字符 */
  @ApiProperty({ description: '角色备注', required: false })
  @IsString({ message: 'remark 类型错误, 正确类型 string' })
  @Length(0, 100, { message: 'name 字符长度在 0~100' })
  @IsOptional()
  remark?: string

  /** 当前角色的菜单组，可选；为"全量替换"语义，会先删后插 */
  @ApiProperty({ description: '当前角色所拥有的菜单组', required: false })
  @IsArray({ message: 'menuIds 类型错误，正确类型 string[]' })
  @IsString({ each: true, message: '菜单组内类型错误' })
  @IsNotEmpty({ each: true, message: '菜单id 不能为空' })
  @IsOptional()
  menuIds?: number[]
}
