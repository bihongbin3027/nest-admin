import { Catch, HttpException, ExceptionFilter, ArgumentsHost } from '@nestjs/common'
import { Logger } from './log4j.util'

/**
 * HTTP 异常过滤器（捕获所有 HttpException 子类）
 * - 业务主动抛出的 BadRequestException / NotFoundException 等都走这里
 * - 通过 status 区分 4xx / 5xx，分别返回 Client Error / Service Error 提示
 * - 与全兜底 ExceptionsFilter 配套：后者负责处理 HttpException 之外的异常
 */
@Catch(HttpException)
export class HttpExceptionsFilter implements ExceptionFilter {
  /**
   * 异常处理入口
   * @param exception 抛出的 HttpException
   * @param host NestJS 提供的 host
   */
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    const request = ctx.getRequest()
    const status = exception.getStatus()
    const exceptionResponse = exception.getResponse()
    const logFormat = `
##############################################################################################################
Request original url: ${request.originalUrl}
Method: ${request.method}
IP: ${request.ip}
Status code: ${status}
Response: ${exception.toString() + `（${exceptionResponse?.message || exception.message}）`}
##############################################################################################################
`
    Logger.info(logFormat)
    response.status(status).json({
      code: status,
      error: exceptionResponse?.message || exception.message,
      msg: `${status >= 500 ? 'Service Error' : 'Client Error'}`,
    })
  }
}
