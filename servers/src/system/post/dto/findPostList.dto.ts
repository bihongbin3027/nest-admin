import { $enum } from 'ts-enum-util'
import { ApiProperty } from '@nestjs/swagger'

import { StatusValue } from '../../../common/enums/common.enum'
import { ReqListQuery } from '../../../common/utils/req-list-query'

/**
 * 岗位列表查询 DTO
 * - 继承 ReqListQuery，自带 page / size
 * - name / code 走模糊匹配；status 走精确匹配
 */
export class FindPostListDto extends ReqListQuery {
  /** 岗位名称（模糊） */
  @ApiProperty({ description: '岗位名称', required: false })
  name?: string

  /** 岗位编码（模糊） */
  @ApiProperty({ description: '岗位编码', required: false })
  code?: string

  /** 岗位状态：0-禁用，1-正常使用 */
  @ApiProperty({ description: '状态 0-禁用，1-正常使用', enum: $enum(StatusValue).getValues(), required: false })
  status?: StatusValue
}
