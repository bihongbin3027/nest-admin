import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsOptional } from 'class-validator'

import { ReqListQuery } from '../../../common/utils/req-list-query'

/**
 * 文件列表查询 DTO
 * - 继承 ReqListQuery，自带 page / size
 * - startDay / endDay 配合使用，按 createDate 区间过滤
 * - 必须两个都非空时区间过滤才生效
 */
export class FindOssDto extends ReqListQuery {
  /** 起始时间（YYYY-MM-DD） */
  @ApiProperty({ description: '搜索条件，起始时间', required: false })
  @IsDateString()
  @IsOptional()
  startDay?: string

  /** 结束时间（YYYY-MM-DD） */
  @ApiProperty({ description: '搜索条件，结束时间', required: false })
  @IsDateString()
  @IsOptional()
  endDay?: string
}
