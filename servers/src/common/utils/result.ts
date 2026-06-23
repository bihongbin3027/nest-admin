import { ApiProperty } from '@nestjs/swagger'

/**
 * 统一响应体（code / msg / data）
 * - 与前端 `client/src/api/base.ts` 的 ResultData<T> 约定一一对应
 * - 配合全局 TransformInterceptor：result.code 同时会被写为 HTTP status code
 * - 业务侧应使用 ResultData.ok() / ResultData.fail() 工厂方法构造
 */
export class ResultData {
  constructor(code = 200, msg?: string, data?: any) {
    this.code = code
    this.msg = msg || 'ok'
    this.data = data || null
  }

  @ApiProperty({ type: 'number', default: 200 })
  code: number

  @ApiProperty({ type: 'string', default: 'ok' })
  msg?: string

  data?: any

  /**
   * 构造成功响应（HTTP 200）
   */
  static ok(data?: any, msg?: string): ResultData {
    return new ResultData(200, msg, data)
  }

  /**
   * 构造失败响应；code 缺省时降级为 500
   */
  static fail(code: number, msg?: string, data?: any): ResultData {
    return new ResultData(code || 500, msg || 'fail', data)
  }
}
