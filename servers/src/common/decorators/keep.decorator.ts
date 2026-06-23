import { SetMetadata } from '@nestjs/common'

/**
 * Reflector metadata key
 * - 在 `TransformInterceptor` 中通过 `Reflector.get(KEEP_KEY, handler)` 读取
 * - 命中时跳过统一响应体包装，让开发者自行操作 `res`（常用于 SSE 流式响应、文件下载等）
 */
export const KEEP_KEY = 'common:keep_transform'

/**
 * @Keep 装饰器
 *
 * 作用：跳过全局 `TransformInterceptor` 的统一响应包装，让接口保持原始返回值或自行写 res。
 *
 * 全局影响：
 * - `TransformInterceptor.intercept` 命中该元数据后直接 `return next.handle()`，不再套用 `{ code, msg, data }` 格式
 * - 同样会被 `ExceptionsFilter` 跳过（两个 filter 均读这个 key）
 *
 * 典型场景：
 * - SSE 流式响应（如 `/rag/ask-stream`），需要直接往 `res.write()` 推送增量数据
 * - 文件下载接口（直接 `res.download()`）
 * - 第三方回调（保持原始 JSON 结构以兼容下游解析）
 *
 * @example
 * ```ts
 * @Sse('ask-stream')
 * @Keep()
 * askStream(@Query() query) {
 *   // 直接订阅、写入 Response...
 * }
 * ```
 */
export const Keep = () => SetMetadata(KEEP_KEY, true)