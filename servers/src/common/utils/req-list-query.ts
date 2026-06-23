import { ApiProperty } from '@nestjs/swagger'

/**
 * 通用分页查询参数基类
 * - 各业务模块的 FindXxxListDto 继承该类即可自动获得 page / size 字段
 * - 仅用于 Swagger 文档展示，运行时由 ValidationPipe + class-transformer 解析
 */
export class ReqListQuery {
  @ApiProperty({ description: '显示页数' })
  page: number

  @ApiProperty({ description: '每页显示条数' })
  size: number
}
