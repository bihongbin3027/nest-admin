import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, IsNotEmpty, IsString, Length, IsIn, Min, IsArray, IsOptional, IsNumberString } from 'class-validator'
import { $enum } from 'ts-enum-util'

import { MenuType } from '../../../common/enums/common.enum'

import { MenuPermDto } from './menu-perm.dto'

/**
 * 更新菜单请求 DTO
 * - 由 PUT /menu 接收
 * - 所有业务字段均可选，MenuService.updateMenu 仅对传入字段执行更新
 * - menuPermList 仍是必填（虽然字段为非可选），因为菜单接口权限走"全量替换"语义
 */
export class UpdateMenuDto {
  /** 菜单主键 id，必填 */
  @ApiProperty({ description: '菜单id', required: false })
  @IsNumberString({}, { message: 'id 类型错误' })
  @IsNotEmpty()
  id: string

  /** 父级菜单 id，可选；非数字字符串会被 IsNumberString 拒掉 */
  @ApiProperty({ description: '父级菜单', required: false })
  @IsNumberString({}, { message: 'parentId 类型错误' })
  @IsNotEmpty({ message: 'parentId 必须填入值' })
  @IsOptional()
  readonly parentId?: number

  /** 菜单名称，可选；传入时校验 2~20 字符 */
  @ApiProperty({ description: '菜单名称', required: false })
  @IsString({ message: 'name 类型错误' })
  @Length(2, 20, { message: 'name 字符长度在 2~20' })
  @IsOptional()
  readonly name?: string

  /** 菜单唯一标识，可选；对应前端路由 name，用于按钮/菜单显隐控制 */
  @ApiProperty({ description: '菜单唯一标识，前端控制页面显隐', required: false })
  @IsString({ message: 'code 类型错误' })
  @IsOptional()
  readonly code?: string

  /** 菜单类型，可选；仅允许 1/2/3 */
  @ApiProperty({
    description: '菜单类型 1-菜单/目录 2-tabs 3-按钮',
    enum: $enum(MenuType).getValues(),
    required: false,
  })
  @IsNumber({}, { message: 'type 类型错误' })
  @IsIn($enum(MenuType).getValues(), { message: 'type 的值只能是 1/2/3，且分别表示菜单/tabs/按钮' })
  @IsOptional()
  readonly type?: MenuType

  /** 排序值，可选；最小 0 */
  @ApiProperty({ description: '排序', required: false })
  @IsNumber({}, { message: '排序传值错误' })
  @Min(0)
  @IsOptional()
  readonly orderNum?: number

  /** 菜单接口权限列表；Service 层走"先删后插"全量替换 */
  @ApiProperty({ description: '菜单接口权限' })
  @IsArray({ message: 'menuPerms 类型错误' })
  menuPermList: MenuPermDto[]
}
