import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

/**
 * 修改/重置密码 DTO（内部传输用）
 * - 该 DTO 在 UserService.updatePassword 入参里并未直接使用，但保留供后续扩展（自定义新密码场景）
 */
export class UpdatePasswordDto {
  /** 目标用户 id */
  userId: string

  /** 新密码（明文，Service 内 bcrypt 加盐） */
  password: string
}
