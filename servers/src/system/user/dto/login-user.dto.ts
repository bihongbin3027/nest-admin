import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

/**
 * 登录入参 DTO
 * - account 字段由 Service 层根据格式判定为「账号 / 手机号 / 邮箱」
 */
export class LoginUser {
  /** 登录账号（账号/手机/邮箱均可） */
  @ApiProperty({ description: '账号' })
  @IsString({ message: 'account 类型错误' })
  @IsNotEmpty({ message: '账号不能为空' })
  readonly account: string

  /** 登录密码（明文） */
  @ApiProperty({ description: '密码' })
  @IsString({ message: 'password 类型错误' })
  @IsNotEmpty({ message: '密码不能为空' })
  readonly password: string
}
