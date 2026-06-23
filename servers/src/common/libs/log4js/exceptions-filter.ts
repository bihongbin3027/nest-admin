import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'

import { Logger } from './log4j.util'

/**
 * 全兜底异常过滤器（捕获所有未分类异常）
 * - 与 HttpExceptionsFilter 配合：能识别为 HttpException 的交给后者，其它未知异常走这里 → 500
 * - 命中后写 ERROR 级别日志（带请求上下文）并返回 { code, msg } 结构
 * - 一般通过 main.ts 的 app.useGlobalFilters(...) 全局注册
 */
@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  /**
   * 异常处理入口
   * @param exception 抛出的异常对象
   * @param host NestJS 提供的 host，用于获取 request / response
   */
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    const request = ctx.getRequest()

    // HttpException 走其自身 status；其它一律 500（未处理异常）
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const logFormat = `
##############################################################################################################
Request original url: ${request.originalUrl}
Method: ${request.method}
IP: ${request.ip}
Status code: ${status}
Response: ${exception}
##############################################################################################################
`
    Logger.error(logFormat)
    response.status(status).json({
      code: status,
      msg: `Service Error: ${exception}`,
    })
  }
}
