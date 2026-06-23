/**
 * Redis 缓存 Key 前缀枚举
 * - 集中维护系统中各模块使用的 Redis Key 前缀，避免散落的字符串字面量
 * - 命名约定：`module:subModule:` 形式，使用 `getRedisKey(prefix, id)` 拼接完整 key
 * - 修改前缀时务必检查调用方：缓存命中率依赖 key 稳定，更换前缀相当于清空缓存
 */
export enum RedisKeyPrefix {
  /** 用户信息缓存（Hash 结构，存储 userEntity 序列化后的字段） */
  USER_INFO = 'user:info:',
  /** 用户角色绑定关系缓存（String 结构，存角色 id 数组的 JSON） */
  USER_ROLE = 'user:role:',
  /** 用户可见菜单树缓存（JSON 序列化后的菜单树） */
  USER_MENU = 'user:menu:',
  /** 用户接口权限码缓存（path-to-regexp 匹配依据） */
  USER_PERM = 'user:perm:',
}