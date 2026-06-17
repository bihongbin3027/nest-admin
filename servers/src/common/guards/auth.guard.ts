import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ALLOW_ANON } from '../decorators/allow-anon.decorator'

import { UserService } from '../../system/user/user.service'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // 【P1-1】免登录路径前缀（与 RolesGuard 路径白名单分离）
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

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const allowAnon = this.reflector.getAllAndOverride<boolean>(ALLOW_ANON, [ctx.getHandler(), ctx.getClass()])
    if (allowAnon) return true
    const req = ctx.switchToHttp().getRequest()
    // 【P1-1】公共路径前缀跳过鉴权（监控 + 健康检查）
    const url = req.originalUrl || req.url || ''
    if (JwtAuthGuard.PUBLIC_PATH_PREFIXES.some((p) => url.startsWith(p))) {
      return true
    }
    const accessToken = req.get('Authorization')
    if (!accessToken) throw new ForbiddenException('请先登录')
    const atUserId = this.userService.verifyToken(accessToken)
    if (!atUserId) throw new UnauthorizedException('当前登录已过期，请重新登录')
    return this.activate(ctx)
  }

  async activate(ctx: ExecutionContext): Promise<boolean> {
    return super.canActivate(ctx) as Promise<boolean>
  }
}
