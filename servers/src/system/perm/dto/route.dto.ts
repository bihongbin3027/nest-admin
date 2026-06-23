import { ApiProperty } from '@nestjs/swagger'

import { $enum } from 'ts-enum-util'

import { RouterMethods } from '../../../common/enums/routerMethod.enum'

/**
 * 路由信息 DTO
 * - 用于"应用全量路由"与"用户接口权限"两类接口的统一返回形态
 * - 字段对应前端路由守卫比对与角色分配下拉展示所需
 */
export class RouteDto {
  /** API 路径，使用 :param 形态（与 RolesGuard 的 path-to-regexp 期望一致） */
  @ApiProperty({ description: 'api 路径' })
  path: string
  /** API 请求方法（GET/POST/PUT/DELETE） */
  @ApiProperty({ description: 'api 方法', enum: $enum(RouterMethods).getValues() })
  method: RouterMethods
  /** API 中文描述，来自 Swagger @ApiOperation summary；按权限分配时给前端展示 */
  @ApiProperty({ description: 'api 描述说明', required: false })
  desc?: string
}
