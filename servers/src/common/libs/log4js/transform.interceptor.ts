import { CallHandler, ExecutionContext, NestInterceptor, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { Logger } from './log4j.util'
import { KEEP_KEY } from '../../../common/decorators/keep.decorator'

/**
 * 全局响应包装拦截器（统一响应日志 + HTTP status code 同步）
 * - 默认包装：把 controller 返回值原样透传（不强制统一为 ResultData），但写一份 info + access 日志
 * - 自动同步：ResultData.fail(code) 场景下，把 result.code 同步写入 HTTP response status
 * - 例外：@Keep() 装饰器跳过本拦截器（SSE 流式 / 文件下载等需要直写 res 时必须加）
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  /**
   * 拦截器入口
   * @param context NestJS 执行上下文
   * @param next 调用链下游
   * @returns 透传或装饰后的 Observable
   */
  intercept(context: ExecutionContext, next: CallHandler<any>): Observable<any> | Promise<Observable<any>> {
    // SSE / 文件下载场景：通过 @Keep() 直接放行，不做包装 / 不写日志
    const isKeep = this.reflector.getAllAndOverride<boolean>(KEEP_KEY, [context.getHandler(), context.getClass()])

    if (isKeep) {
      return next.handle()
    }

    const req = context.switchToHttp().getRequest()
    const res = context.switchToHttp().getResponse()

    return next.handle().pipe(
      map((data) => {
        // 若 controller 已返回 ResultData，safeData 取内部 data；否则原样展示（避免重复包装）
        const safeData = data && typeof data === 'object' && 'data' in data ? data.data : data

        // 【修项目 bug】ResultData.fail(code) 必须反映到 HTTP status code
        // 之前没设置，导致 controller 返回 ResultData.fail(403) 但 HTTP 仍是 200
        // 审计 / 监控 / 前端拦截都依赖正确的 HTTP status
        if (data && typeof data === 'object' && 'code' in data && typeof data.code === 'number') {
          // 只有当 HTTP 还没写过 body 才允许改 status
          if (!res.headersSent) {
            res.status(data.code)
          }
        }

        const logFormat = `
##############################################################################################################
Request original url: ${req.originalUrl}
Method: ${req.method}
IP: ${req.ip}
User: ${JSON.stringify(req.user || 'Guest')}
Response data: ${JSON.stringify(safeData || 'Stream/NoContent')}
##############################################################################################################
`
        Logger.info(logFormat)
        Logger.access(logFormat)
        return data
      }),
    )
  }
}
