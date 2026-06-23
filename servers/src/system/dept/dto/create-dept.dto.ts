import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty, IsNumber, Min, IsOptional, MinLength, MaxLength } from 'class-validator'

/**
 * 创建部门 DTO
 * - DeptController.create / DeptService.create 使用
 * - parentId === '0' 表示根部门
 */
export class CreateDeptDto {
  /** 上级部门 id，'0' 表示根部门 */
  @ApiProperty({ description: '上级部门 id' })
  @IsString({ message: 'parentId 类型错误，正确类型 string' })
  @IsNotEmpty({ message: 'parentId 不能为空' })
  readonly parentId: string

  /** 部门名称（2-50 字符） */
  @ApiProperty({ description: '部门名称' })
  @IsString({ message: 'name 类型错误, 正确类型 string' })
  @IsNotEmpty({ message: 'name 不能为空' })
  @MinLength(2, { message: '部门名称至少2个字符' })
  @MaxLength(50, { message: '部门名称最多50个字符' })
  readonly name: string

  /** 部门负责人姓名 */
  @ApiProperty({ description: '部门负责人' })
  @IsString({ message: 'leader 类型错误，正确类型 string' })
  @IsNotEmpty({ message: 'leader 不能为空' })
  readonly leader: string

  /** 备注（可选） */
  @ApiProperty({ description: '备注', required: false })
  @IsString({ message: 'remark  类型错误，正确类型 string' })
  @IsOptional()
  remark?: string

  /** 同级排序（数字越大越靠前，需 ≥ 0） */
  @ApiProperty({ description: '排序' })
  @IsNumber({}, { message: 'orderNum 类型错误， 正确类型 number ' })
  @Min(0)
  readonly orderNum: number
}
