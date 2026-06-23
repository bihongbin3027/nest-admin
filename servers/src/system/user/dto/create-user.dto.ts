import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsMobilePhone, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * 用户注册 DTO
 * - 用于 BaseController.register 与 UserService.create
 * - 密码与确认密码在 Service 内做强校验（两次输入需一致）
 */
export class CreateUserDto {
  /** 登录账号（5-20 字符，全局唯一） */
  @ApiProperty({ description: '用户账号' })
  @IsString({ message: 'account 类型错误，正确类型 string' })
  @IsNotEmpty({ message: 'account 不能为空' })
  @MinLength(5, { message: '账号至少5个字符' })
  @MaxLength(20, { message: '账号最多20个字符' })
  readonly account: string

  /** 登录密码（明文，Service 内 bcrypt 加盐入库） */
  @ApiProperty({ description: '密码' })
  @IsString({ message: 'password 类型错误，正确类型 string' })
  @IsNotEmpty({ message: 'password 不能为空' })
  password: string

  /** 手机号（可选，国内手机号校验） */
  @ApiProperty({ description: '手机号', required: false })
  @IsString({ message: 'phoneNum 类型错误，正确类型 string' })
  @IsMobilePhone('zh-CN', { strictMode: false }, { message: '请输入正确的手机号' })
  @IsOptional()
  // @IsPhoneNumber('CH', { message: '请输入正确的手机号' })
  readonly phoneNum?: string

  /** 邮箱地址（可选，需符合邮箱格式） */
  @ApiProperty({ description: '邮箱', required: false })
  @IsString({ message: 'email 类型错误，正确类型 string' })
  @IsEmail()
  @IsOptional()
  readonly email?: string

  /** 确认密码（必须与 password 一致，由 Service 校验） */
  @ApiProperty({ description: '确认密码' })
  @IsString({ message: ' confirmPassword 类型错误，正确类型 string' })
  readonly confirmPassword: string

  /** 头像 URL（可选） */
  @ApiProperty({ description: '头像', required: false })
  @IsString({ message: 'avatar 类型错误，正确类型 string' })
  @IsOptional()
  readonly avatar?: string
}
