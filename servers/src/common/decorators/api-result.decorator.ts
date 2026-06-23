import { Type, applyDecorators } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger'
import { ResultData } from '../utils/result'

/**
 * 视为 Swagger 原生 JSON Schema 的基础类型名
 * - 这些类型走 `{ type: 'string' }` 等内联形式，不生成 $ref 引用
 */
const baseTypeNames = ['String', 'Number', 'Boolean']
/**
 * Swagger 响应装饰器：与全局 `ResultData<T>` 统一响应体对齐
 *
 * @param model `data` 字段类型（可省略，省略时 `data` 渲染为 `null`）
 * @param isArray `data` 是否为数组；若同时传 `isPager` 则优先生成分页结构
 * @param isPager 标记为分页结果，渲染为 `{ list: T[], total: number }`
 *
 * 使用示例：
 * ```ts
 * @Get('info')
 * @ApiResult(UserEntity)                // data: UserEntity
 *
 * @Get('list')
 * @ApiResult(UserEntity, true, true)    // data: { list: UserEntity[], total: 0 }
 *
 * @Get('count')
 * @ApiResult(Number, false)             // data: number
 * ```
 *
 * 影响：
 * - 仅作用于 Swagger 文档生成，不改变实际接口响应
 * - 与 `TransformInterceptor` 配合：运行时返回 `{ code, msg, data }`，文档保持一致
 */
export const ApiResult = <TModel extends Type<any>>(model?: TModel, isArray?: boolean, isPager?: boolean) => {
  let items = null
  // 基础类型走原生 type；自定义类通过 ApiExtraModels 注册后再用 $ref 引用
  const modelIsBaseType = model && baseTypeNames.includes(model.name)
  if (modelIsBaseType) {
    items = { type: model.name.toLocaleLowerCase() }
  } else {
    items = { $ref: getSchemaPath(model) }
  }
  // 根据入参组合 data 的四种形态：分页对象 / 数组 / 单值 / null
  let prop = null
  if (isArray && isPager) {
    prop = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items,
        },
        total: {
          type: 'number',
          default: 0,
        },
      },
    }
  } else if (isArray) {
    prop = {
      type: 'array',
      items,
    }
  } else if (model) {
    prop = items
  } else {
    prop = { type: 'null', default: null }
  }
  // 通过 allOf 将 ResultData 的 code/msg 字段与自定义 data 字段合并到响应 schema
  return applyDecorators(
    ApiExtraModels(...(model && !modelIsBaseType ? [ResultData, model] : [ResultData])),
    ApiOkResponse({
      schema: {
        allOf: [
          { $ref: getSchemaPath(ResultData) },
          {
            properties: {
              data: prop,
            },
          },
        ],
      },
    }),
  )
}