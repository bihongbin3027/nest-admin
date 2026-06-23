import { SetMetadata } from '@nestjs/common'

/** Reflector metadata key，RolesGuard 通过此 key 跳过接口级权限匹配 */
export const ALLOW_NO_PERM = 'allowNoPerm'

/**
 * @AllowNoPerm 装饰器：标记接口跳过 `RolesGuard` 的接口权限校验
 *
 * 与 `@AllowAnon()` 的区别：
 * - `@AllowAnon()`：免登录（跳过 JwtAuthGuard，req.user 为 undefined）
 * - `@AllowNoPerm()`：需要登录，但跳过权限匹配（req.user 已挂载，仍走 JwtAuthGuard）
 *
 * 使用场景：
 * - 个人中心、修改自己密码、刷新 token 等"登录即可"的接口
 * - RAG 流式问答、上传文件等不影响安全但需要用户身份的接口
 *
 * @example
 * ```ts
 * @Post('refresh-token')
 * @AllowNoPerm()
 * async refreshToken(@Req() req) { ... }
 * ```
 */
export const AllowNoPerm = () => SetMetadata(ALLOW_NO_PERM, true)