import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsIn } from 'class-validator'
import { $enum } from 'ts-enum-util'

import { RouterMethods } from '../../../common/enums/routerMethod.enum'

/**
 * 菜单接口权限条目 DTO
 * - 由 CreateMenuDto.menuPermList / UpdateMenuDto.menuPermList 嵌套使用
 * - 写入 sys_menu_perm 表，是"菜单可调用哪些后端接口"的最小粒度
 */
export class MenuPermDto {
  /** HTTP 方法，仅允许 RouterMethods 枚举（GET/POST/PUT/DELETE） */
  @ApiProperty({ description: 'api method 值 POST PUT GET DELETE', enum: $enum(RouterMethods).getValues() })
  @IsString({ message: 'apiMethod 类型错误' })
  @IsNotEmpty({ message: 'apiMethod 不能为空' })
  @IsIn($enum(RouterMethods).getValues())
  readonly apiMethod: RouterMethods

  /** 后端接口路径（须是本应用接口，否则设置了也不生效） */
  @ApiProperty({ description: 'api url' })
  @IsString({ message: 'apiUrl 类型错误' })
  @IsNotEmpty({ message: 'apiUrl 不能为空' })
  readonly apiUrl: string
}
