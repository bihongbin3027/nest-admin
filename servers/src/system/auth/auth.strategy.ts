import { PassportStrategy } from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { UnauthorizedException, Injectable } from '@nestjs/common'

import { AuthService } from './auth.service'

/**
 * JWT 鉴权策略（passport-jwt）
 * - 从 Authorization: Bearer <token> 头抽取 JWT，使用 HS256 + 配置中的 jwt.secretkey 校验签名
 * - 校验通过后将 token payload 交给 validate 方法查用户；返回的 user 会被 passport 挂到 req.user
 * - 配合全局 JwtAuthGuard 使用：默认拦截所有非白名单接口
 */
@Injectable()
export class AuthStrategy extends PassportStrategy(Strategy) {
  /**
   * 构造时向 passport-jwt 父类传入运行时配置：
   * - jwtFromRequest：从 Authorization: Bearer <token> 头抽取 token
   * - secretOrKey：使用配置项 jwt.secretkey 作为签名校验密钥
   * - algorithms：限定 HS256，避免 alg=none 等攻击
   */
  constructor(private readonly authService: AuthService, private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('jwt.secretkey'),
      algorithms: ['HS256'],
    })
  }

  /**
   * passport-jwt 的钩子：签名 + 过期校验通过后由父类回调
   * - payload 即 token 解码后的内容（创建时塞入的 { id }）
   * - 返回值会被 passport 自动挂到 req.user，供下游守卫（RolesGuard）和业务方法使用
   * @param payload JWT 解析后的负载 { id }
   * @returns 当前登录用户实体；不存在时抛 UnauthorizedException
   */
  async validate(payload: { id: string }) {
    const user = await this.authService.validateUser(payload)
    // 命中即代表 token 未过期且对应用户存在；找不到则视为伪造或已被禁用
    if (!user) throw new UnauthorizedException()
    return user
  }
}
