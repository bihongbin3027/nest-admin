import { RedisKeyPrefix } from '../enums/redis-key-prefix.enum'

/**
 * 通用工具函数集合
 * - Redis key 拼接 + 命名风格转换（camelCase / underline）
 */

/**
 * 获取 模块前缀与唯一标识 整合后的 redis key
 * - 约定：所有业务侧 redis key 都以 RedisKeyPrefix 枚举值开头，便于按模块批量删除
 * @param moduleKeyPrefix 模块前缀（来自 RedisKeyPrefix 枚举）
 * @param id id 或 唯一标识
 */
export function getRedisKey(moduleKeyPrefix: RedisKeyPrefix, id: string | number): string {
  return `${moduleKeyPrefix}${id}`
}

/**
 * 下划线转驼峰（如 sys_user_name → sysUserName）
 * @param str 待转换字符串
 * @returns 驼峰形式
 */
export function toCamelCase(str: string): string {
  return str.replace(/_(\w)/g, (_, c) => c.toUpperCase())
}

/**
 * 驼峰命名转下划线（如 sysUserName → sys_user_name）
 * @param str 待转换字符串
 * @returns 下划线形式
 */
export function toUnderline(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase()
}

/**
 * 批量转换对象 key 的命名风格（camelCase / underline）
 * - 可选 cutStr 用于裁剪字段前缀（例如裁掉 "raw_" 后再做转换）
 * @param target 目标对象
 * @param targetType 目标命名风格
 * @param cutStr 对象 key 裁剪字段（可选）
 */
export function objAttrToCamelOrUnderline(
  target: Record<string, any>,
  targetType: 'camelCase' | 'underline',
  cutStr?: string,
) {
  const _target = {}
  Object.keys(target).forEach((k) => {
    let _k = k
    if (cutStr) {
      _k = _k.replace(cutStr, '')
    }
    _k = targetType === 'camelCase' ? toCamelCase(_k) : toUnderline(_k)
    _target[_k] = target[k]
  })
  return _target
}
