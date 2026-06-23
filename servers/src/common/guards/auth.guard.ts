import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ALLOW_ANON } from '../decorators/allow-anon.decorator'

import { UserService } from '../../system/user/user.service'

/**
 * JWT 鉴权守卫（全局 APP_GUARD 之一）
 * - 继承 passport-jwt 的 AuthGuard('jwt')，处理 Authorization: Bearer <token> 的解析
 * - 顺序：@AllowAnon() → 公共路径前缀 → Token 解析 → 委托给父类 canActivate 完成 passport 校验
 * - 与 RolesGuard 解耦：本守卫只负责"有没有合法 Token"，权限匹配由 RolesGuard 负责
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // 免登录路径前缀（与 RolesGuard 路径白名单分离）
  // Prometheus 抓 /metrics、k8s 探针 /health 不需要 token
  private static readonly PUBLIC_PATH_PREFIXES = ['/api/metrics', '/api/health']

  constructor(
    private readonly reflector: Reflector,
    @Inject(UserService)
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {
    super()
  }

  /**
   * 鉴权入口：依次放行 AllowAnon、公共前缀，缺失/无效 Token 直接抛异常
   * @param ctx NestJS 执行上下文
   * @returns true 表示放行；抛 ForbiddenException / UnauthorizedException 表示拒绝
   */
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 控制器或方法打了 @AllowAnon() 直接放行
    const allowAnon = this.reflector.getAllAndOverride<boolean>(ALLOW_ANON, [ctx.getHandler(), ctx.getClass()])
    if (allowAnon) return true
    const req = ctx.switchToHttp().getRequest()
    // 公共路径前缀跳过鉴权（监控 + 健康检查）
    const url = req.originalUrl || req.url || ''
    if (JwtAuthGuard.PUBLIC_PATH_PREFIXES.some((p) => url.startsWith(p))) {
      return true
    }
    // 缺少 Authorization 头直接抛 403（业务约定：未登录 = 无权）
    const accessToken = req.get('Authorization')
    if (!accessToken) throw new ForbiddenException('请先登录')
    // 解析 token，无效则抛 401 提示登录过期
    const atUserId = this.userService.verifyToken(accessToken)
    if (!atUserId) throw new UnauthorizedException('当前登录已过期，请重新登录')
    // 走 passport-jwt 自身的校验（签名/过期由父类完成）
    return this.activate(ctx)
  }

  /**
   * 转发到 passport-jwt 父类 canActivate 完成签名校验
   * - 单独抽出来方便在 canActivate 内自定义前置流程后委托
   */
  async activate(ctx: ExecutionContext): Promise<boolean> {
    return super.canActivate(ctx) as Promise<boolean>
  }
}
