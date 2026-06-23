import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, MinLength, MaxLength } from 'class-validator'

/**
 * 创建岗位 DTO
 * - PostController.create / PostService.create 使用
 */
export class CreatePostDto {
  /** 岗位编码（业务唯一，≤ 50 字符） */
  @ApiProperty({ description: '岗位编码' })
  @IsString({ message: 'code 类型错误，正确类型 string' })
  @IsNotEmpty({ message: 'code 不能为空' })
  @MaxLength(50, { message: '岗位编码最多50个字符' })
  readonly code: string

  /** 岗位名称（2-50 字符） */
  @ApiProperty({ description: '岗位名称' })
  @IsString({ message: 'name 类型错误, 正确类型 string' })
  @IsNotEmpty({ message: 'name 不能为空' })
  @MinLength(2, { message: '岗位名称至少2个字符' })
  @MaxLength(50, { message: '岗位名称最多50个字符' })
  readonly name: string

  /** 列表排序（≥ 0） */
  @ApiProperty({ description: '排序' })
  @IsNumber({}, { message: 'orderNum 类型错误， 正确类型 number ' })
  @Min(0)
  readonly orderNum: number

  /** 备注（可选） */
  @ApiProperty({ description: '备注' })
  @IsString({ message: 'remark 类型错误, 正确类型 string' })
  @IsOptional()
  readonly remark: string
}
