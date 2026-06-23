import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNumber, Min, IsOptional, IsNumberString, IsIn, MinLength, MaxLength } from 'class-validator'
import { $enum } from 'ts-enum-util'

import { StatusValue } from '../../../common/enums/common.enum'

/**
 * 更新岗位 DTO
 * - PostController.update / PostService.update 使用
 * - 除 id 外所有字段均可选，前端按需提交
 */
export class UpdatePostDto {
  /** 目标岗位 id（必填） */
  @ApiProperty({ description: 'id' })
  @IsNumberString({}, { message: 'id 类型错误，正确类型 string' })
  readonly id: string

  /** 岗位名称（2-50 字符） */
  @ApiProperty({ description: '部门名称', required: false })
  @IsString({ message: 'name 类型错误, 正确类型 string' })
  @MinLength(2, { message: '岗位名称至少2个字符' })
  @MaxLength(50, { message: '岗位名称最多50个字符' })
  @IsOptional()
  readonly name?: string

  /** 岗位编码（≤ 50 字符） */
  @ApiProperty({ description: '岗位编码' })
  @IsString({ message: 'code 类型错误，正确类型 string' })
  @MaxLength(50, { message: '岗位编码最多50个字符' })
  @IsOptional()
  readonly code?: string

  /** 岗位状态：1-有效，0-禁用 */
  @ApiProperty({ description: '状态', enum: $enum(StatusValue).getValues(), required: false })
  @IsNumber({}, { message: 'status 类型错误， 正确类型 number ' })
  @IsIn($enum(StatusValue).getValues())
  @IsOptional()
  readonly status?: StatusValue

  /** 列表排序（≥ 0） */
  @ApiProperty({ description: '排序', required: false })
  @IsNumber({}, { message: 'orderNum 类型错误， 正确类型 number ' })
  @Min(0)
  @IsOptional()
  readonly orderNum?: number

  /** 备注（可选） */
  @ApiProperty({ description: '备注', required: false })
  @IsString({ message: 'remark 类型错误, 正确类型 string' })
  @IsOptional()
  readonly remark?: string
}
