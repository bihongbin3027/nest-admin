import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsIn, IsNumber, IsString, Min, IsNotEmpty, Length, IsNumberString } from 'class-validator'
import { $enum } from 'ts-enum-util'

import { MenuType } from '../../../common/enums/common.enum'

import { MenuPermDto } from './menu-perm.dto'

/**
 * 创建菜单请求 DTO
 * - 由 POST /menu 接收
 * - 通过 class-validator 校验后由 MenuService.create 在事务内写入 sys_menu 与 sys_menu_perm
 */
export class CreateMenuDto {
  /** 父级菜单 id，'0' 表示根菜单；非数字字符串会被 IsNumberString 拒掉 */
  @ApiProperty({ description: '父级菜单' })
  @IsNumberString({}, { message: 'parent 类型错误' })
  @IsNotEmpty({ message: 'parentId 必须填入值' })
  readonly parentId: string

  /** 菜单名称，2~20 字符 */
  @ApiProperty({ description: '菜单名称' })
  @IsString()
  @Length(2, 20, { message: 'name 字符长度在 2~20' })
  readonly name: string

  /** 菜单唯一标识，对应前端路由 name，用于按钮/菜单显隐控制 */
  @ApiProperty({ description: '菜单唯一标识，前端控制页面显隐' })
  @IsString({ message: 'code 类型错误，正确类型 string' })
  readonly code: string

  /** 菜单类型：1-菜单/目录、2-tabs、3-按钮 */
  @ApiProperty({
    description: '菜单类型 1-菜单/目录 2-tabs 3-按钮',
    enum: $enum(MenuType).getValues(),
    required: false,
  })
  @IsNumber({}, { message: 'type 类型错误' })
  @IsIn($enum(MenuType).getValues(), { message: 'type 的值只能是 1/2/3，且分别表示菜单/tabs/按钮' })
  readonly type: MenuType

  /** 排序值，越大越靠前，最小 0 */
  @ApiProperty({ description: '排序', required: false })
  @IsNumber({}, { message: '排序传值错误' })
  @Min(0)
  readonly orderNum: number

  /** 该菜单所绑定的接口权限列表（path + method），写入 sys_menu_perm */
  @ApiProperty({ description: '菜单接口路径权限' })
  @IsArray({ message: '菜单权限是数组格式' })
  readonly menuPermList: MenuPermDto[]
}
