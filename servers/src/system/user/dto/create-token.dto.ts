import { ApiProperty } from '@nestjs/swagger'

/**
 * 登录态 token 响应 DTO
 * - accessToken：接口鉴权使用（前端放在 Authorization: Bearer xxx）
 * - refreshToken：accessToken 过期后用于换发新 token
 */
export class CreateTokenDto {
  /** 访问 token，登录态访问受保护接口时使用 */
  @ApiProperty({ description: 'token' })
  accessToken: string

  /** 刷新 token，accessToken 过期后凭此换发 */
  @ApiProperty({ description: '刷新 token' })
  refreshToken: string
}
