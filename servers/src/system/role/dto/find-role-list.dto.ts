import { ApiProperty } from '@nestjs/swagger'

import { ReqListQuery } from '../../../common/utils/req-list-query'

/**
 * 角色列表查询 DTO
 * - 继承 ReqListQuery，附带分页字段 page / size
 * - 当前实现未在 RoleService.findList 中实际使用（findList 直接按用户类型分支），保留用于将来扩展
 */
export class FindRoleListDto extends ReqListQuery {
  /** 角色名称模糊查询关键词，可选 */
  @ApiProperty({ description: '角色名称', required: false })
  name?: string
}
