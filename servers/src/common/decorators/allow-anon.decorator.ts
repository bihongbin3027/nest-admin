import { SetMetadata } from '@nestjs/common'

/**
 * 跳过 JWT 校验的元数据键名
 * - 与全局 `JwtAuthGuard` 中 `Reflector.get(ALLOW_ANON, ...)` 保持一致
 * - 改动字面量需同步修改 `auth.guard.ts`，否则守卫读不到
 */
export const ALLOW_ANON = 'allowAnon'

/**
 * @AllowAnon 装饰器：标记控制器方法为"免登录"
 *
 * 全局行为：
 * - 被全局 `JwtAuthGuard` 检测到后跳过 Passport JWT 解析，直接放行
 * - `req.user` 为 `undefined`，下游业务请做好空值保护
 * - 不会绕过 `RolesGuard`，如需同时跳过权限校验请叠加 `@AllowNoPerm()`
 *
 * 适用场景：
 * - 登录 / 注册 / 验证码等公开业务接口
 * - Swagger UI、Prometheus 抓取端点 `/metrics`、健康检查 `/health` 等运维接口
 * - 已加入 `perm.router.whitelist` 的路由**无需**本装饰器
 *
 * @example
 * ```ts
 * @Post('login')
 * @AllowAnon()
 * @AllowNoPerm()
 * login(@Body() dto: LoginDto) { ... }
 * ```
 */
export const AllowAnon = () => SetMetadata(ALLOW_ANON, true)