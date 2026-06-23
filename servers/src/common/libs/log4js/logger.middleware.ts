import { NextFunction, Request, Response } from 'express'
import { Logger } from './log4j.util'

/**
 * Express 访问日志中间件
 * - 由 main.ts 的 app.use(logger) 注册（在 Nest 之前）
 * - 先 next() 放行，再根据最终 statusCode 分级记录（error / warn / access）
 * - 与审计模块（AuditInterceptor）职责不同：本中间件记录**所有**请求（含失败），审计模块只关注已鉴权用户操作
 */
export function logger(req: Request, res: Response, next: NextFunction) {
  // 注意：此时 res.statusCode 仍是请求开始时的默认值（通常 200）
  // 真正的 statusCode 要在响应阶段才会被改写，next() 之后再读就是最终值
  const statusCode = res.statusCode
  const logFormat = `
##############################################################################################################
RequestOriginal: ${req.originalUrl}
Method: ${req.method}
IP: ${req.ip}
StatusCode: ${statusCode}
Params: ${JSON.stringify(req.params)}
Query: ${JSON.stringify(req.query)}
Body: ${JSON.stringify(req.body)}
##############################################################################################################
`

  next()

  // 按状态码分级：5xx → error，4xx → warn，其它（2xx/3xx）→ access + log
  if (statusCode >= 500) {
    Logger.error(logFormat)
  } else if (statusCode >= 400) {
    Logger.warn(logFormat)
  } else {
    Logger.access(logFormat)
    Logger.log(logFormat)
  }
}
