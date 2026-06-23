import { CanActivate, Inject, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { match } from 'path-to-regexp'

import { ALLOW_ANON } from '../decorators/allow-anon.decorator'
import { ALLOW_NO_PERM } from '../decorators/perm.decorator'

import { PermService } from '../../system/perm/perm.service'
import { UserType } from '../enums/common.enum'

/**
 * 接口权限守卫（全局 APP_GUARD 之一，依赖 JwtAuthGuard 先解析出 req.user）
 * - 优先级：@AllowAnon() → 全局路径白名单（config perm.router.whitelist）→ @AllowNoPerm() → 超管放行 → 用户权限匹配
 * - 匹配算法：path-to-regexp v8（match(path)(url) 返回 false 或 { params }）
 * - 必须与 JwtAuthGuard 配套：未挂 JwtAuthGuard 时 req.user 为 undefined，会被直接拒绝
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private globalWhiteList = []
  constructor(
    private readonly reflector: Reflector,
    @Inject(PermService)
    private readonly permService: PermService,
    private readonly config: ConfigService,
  ) {
    // 启动时一次性把 YAML 配置里的白名单读入内存，后续请求直接命中
    this.globalWhiteList = [].concat(this.config.get('perm.router.whitelist') || [])
  }

  /**
   * 权限校验入口
   * @param ctx NestJS 执行上下文
   * @returns true 放行；false / ForbiddenException 拒绝
   */
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 首先 无 token 的 是不需要 对比权限
    const allowAnon = this.reflector.getAllAndOverride<boolean>(ALLOW_ANON, [ctx.getHandler(), ctx.getClass()])
    if (allowAnon) return true
    // 全局配置，
    const req = ctx.switchToHttp().getRequest()

    // 先匹配全局白名单：method + path-to-regexp 同时命中才放行
    const i = this.globalWhiteList.findIndex((route) => {
      // 请求方法类型相同
      if (req.method.toUpperCase() === route.method.toUpperCase()) {
        // path-to-regexp v8:match(path)(url) 返回 false 或 { path, params, index }
        const fn = match(route.path, { decode: decodeURIComponent })
        return !!fn(req.url)
      }
      return false
    })
    // 在白名单内 则 进行下一步， i === -1 ，则不在白名单，需要 比对是否有当前接口权限
    if (i > -1) return true
    // 函数请求头配置 AllowNoPerm 装饰器 无需验证权限
    const allowNoPerm = this.reflector.getAllAndOverride<boolean>(ALLOW_NO_PERM, [ctx.getHandler(), ctx.getClass()])
    if (allowNoPerm) return true

    // 需要比对 该用户所拥有的 接口权限
    const user = req.user
    // 没有挈带 token 直接返回 false
    if (!user) return false
    // 超管直接放行，跳过逐条路由匹配
    if (user.type === UserType.SUPER_ADMIN) return true

    // 普通用户：拉取用户拥有权限列表，逐条 path-to-regexp 匹配
    const userPermApi = await this.permService.findUserPerms(user.id)
    const index = userPermApi.findIndex((route) => {
      // 请求方法类型相同
      if (req.method.toUpperCase() === route.method.toUpperCase()) {
        // 对比 url（剥离 query 后再匹配，避免 ?xxx 影响正则解析）
        const reqUrl = req.url.split('?')[0]
        // path-to-regexp v8
        const fn = match(route.path, { decode: decodeURIComponent })
        return !!fn(reqUrl)
      }
      return false
    })
    // 完全无匹配则拒绝
    if (index === -1) throw new ForbiddenException('您无权限访问该接口')
    return true
  }
}
