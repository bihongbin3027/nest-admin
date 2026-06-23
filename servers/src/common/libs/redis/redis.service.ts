import { Inject, Injectable } from '@nestjs/common'
import Redis from 'ioredis'

import { REDIS_CLIENT } from './redis.constants'

/**
 * Redis 业务封装（基于 ioredis）
 * - 屏蔽底层 ioredis 命令名差异，对外暴露业务语义化方法（如 hGetAll / lLeftPush）
 * - 缺失 key / 非法入参时统一返回 null / 0，避免抛错中断业务
 * - 与 RedisModule 配套使用：REDIS_CLIENT token 在 RedisModule.forRootAsync() 中注入
 */
@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /**
   * 获取原生 ioredis 客户端
   * - 业务侧一般不需要；仅在需要执行未封装命令（如 SCAN / SUBSCRIBE）时使用
   */
  getClient(): Redis {
    return this.client
  }

  /* --------------------- string 相关 -------------------------- */

  /**
   * 设置 string 值
   * @param key 存储 key 值
   * @param val key 对应的 val
   * @param seconds 可选，过期时间，单位 秒
   */
  async set(key: string, val: string, seconds?: number): Promise<'OK' | null> {
    if (!seconds) return await this.client.set(key, val)
    return await this.client.set(key, val, 'EX', seconds)
  }

  /**
   * 返回对应 value；key 为空或通配符 '*' 直接返回 null（避免误删/误读）
   * @param key redis key
   */
  async get(key: string): Promise<string> {
    if (!key || key === '*') return null
    return await this.client.get(key)
  }

  /**
   * 删除一个或多个 key（通配符 '*' 不允许）
   * @param keys 单个 key 或 key 数组
   */
  async del(keys: string | string[]): Promise<number> {
    if (!keys || keys === '*') return 0
    if (typeof keys === 'string') keys = [keys]
    return await this.client.del(...keys)
  }

  /**
   * 查询 key 剩余 TTL（秒）
   * @param key redis key
   */
  async ttl(key: string): Promise<number | null> {
    if (!key) return null
    return await this.client.ttl(key)
  }

  /* ----------------------- hash ----------------------- */

  /**
   * hash 设置 key 下单个 field value
   * @param key redis key
   * @param field 属性
   * @param value 值
   */
  async hset(key: string, field: string, value: string): Promise<string | number | null> {
    if (!key || !field) return null
    return await this.client.hset(key, field, value)
  }

  /**
   * hash 设置 key 下多个 field value
   * @param key redis key
   * @param data 字段值对象
   * @param expire 过期时间（秒，可选）
   */
  async hmset(key: string, data: Record<string, string | number | boolean>, expire?: number): Promise<number | any> {
    if (!key || !data) return 0
    const result = await this.client.hmset(key, data)
    if (expire) {
      await this.client.expire(key, expire)
    }
    return result
  }

  /**
   * hash 获取单个 field 的 value
   * @param key redis key
   * @param field 属性
   */
  async hget(key: string, field: string): Promise<number | string | null> {
    if (!key || !field) return 0
    return await this.client.hget(key, field)
  }

  /**
   * hash 获取 key 下所有 field 的 value（数组）
   * @param key redis key
   */
  async hvals(key: string): Promise<string[]> {
    if (!key) return []
    return await this.client.hvals(key)
  }

  /**
   * hash 获取 key 下所有 field → value 映射（Record）
   * - 与 hvals 的区别：返回值带 field 名，便于做属性对象
   */
  async hGetAll(key: string): Promise<Record<string, string>> {
    return await this.client.hgetall(key)
  }
  /**
   * hash 删除 key 下 一个或多个 fields value
   * @param key redis key
   * @param fields 单个或多个 field
   */
  async hdel(key: string, fields: string | string[]): Promise<string[] | number> {
    if (!key || fields.length === 0) return 0
    return await this.client.hdel(key, ...fields)
  }

  /**
   * hash 删除 key 下所有 fields value
   * @param key redis key
   */
  async hdelAll(key: string): Promise<string[] | number> {
    if (!key) return 0
    const fields = await this.client.hkeys(key)
    if (fields.length === 0) return 0
    return await this.hdel(key, fields)
  }

  /* -----------   list 相关操作 ------------------ */

  /**
   * 获取列表长度
   * @param key redis key
   */
  async lLength(key: string): Promise<number> {
    if (!key) return 0
    return await this.client.llen(key)
  }

  /**
   * 通过索引设置列表元素的值
   * @param key redis key
   * @param index 列表索引
   * @param val 待写入值
   */
  async lSet(key: string, index: number, val: string): Promise<'OK' | null> {
    if (!key || index < 0) return null
    return await this.client.lset(key, index, val)
  }

  /**
   * 通过索引获取 列表中的元素
   * @param key redis key
   * @param index 列表索引
   */
  async lIndex(key: string, index: number): Promise<string | null> {
    if (!key || index < 0) return null
    return await this.client.lindex(key, index)
  }

  /**
   * 获取列表指定范围内的元素
   * @param key redis key
   * @param start 开始位置， 0 是开始位置
   * @param stop 结束位置， -1 返回所有
   */
  async lRange(key: string, start: number, stop: number): Promise<string[] | null> {
    if (!key) return null
    return await this.client.lrange(key, start, stop)
  }

  /**
   * 将一个或多个值插入到列表头部（左侧）
   * @param key redis key
   * @param val 待插入值
   */
  async lLeftPush(key: string, ...val: string[]): Promise<number> {
    if (!key) return 0
    return await this.client.lpush(key, ...val)
  }

  /**
   * 将一个值或多个值插入到已存在的列表头部（左侧）
   * @param key redis key
   * @param val 待插入值
   */
  async lLeftPushIfPresent(key: string, ...val: string[]): Promise<number> {
    if (!key) return 0
    return await this.client.lpushx(key, ...val)
  }

  /**
   * 如果 pivot 存在，则在 pivot 前面添加
   * @param key redis key
   * @param pivot 锚点元素
   * @param val 待插入值
   */
  async lLeftInsert(key: string, pivot: string, val: string): Promise<number> {
    if (!key || !pivot) return 0
    return await this.client.linsert(key, 'BEFORE', pivot, val)
  }

  /**
   * 如果 pivot 存在，则在 pivot 后面添加
   * @param key redis key
   * @param pivot 锚点元素
   * @param val 待插入值
   */
  async lRightInsert(key: string, pivot: string, val: string): Promise<number> {
    if (!key || !pivot) return 0
    return await this.client.linsert(key, 'AFTER', pivot, val)
  }

  /**
   * 在列表右端添加一个或多个值
   * - 实现注意：内部委托给 lpush（保持与其它方法的 lpush 风格一致，与原生 RPUSH 行为等价）
   * @param key redis key
   * @param val 待插入值
   */
  async lRightPush(key: string, ...val: string[]): Promise<number> {
    if (!key) return 0
    return await this.client.lpush(key, ...val)
  }

  /**
   * 为已存在的列表右端添加一个或多个值
   * @param key redis key
   * @param val 待插入值
   */
  async lRightPushIfPresent(key: string, ...val: string[]): Promise<number> {
    if (!key) return 0
    return await this.client.rpushx(key, ...val)
  }

  /**
   * 阻塞式移除并获取列表第一个元素（左侧 blpop）
   * - 列表为空时会一直阻塞，直到有元素可弹出；调用方需自行控制超时
   * @param key redis key
   */
  async lLeftPop(key: string): Promise<string> {
    if (!key) return null
    const result = await this.client.blpop(key)
    return result.length > 0 ? result[0] : null
  }

  /**
   * 阻塞式移除并获取列表最后一个元素（右侧 brpop）
   * @param key redis key
   */
  async lRightPop(key: string): Promise<string> {
    if (!key) return null
    const result = await this.client.brpop(key)
    return result.length > 0 ? result[0] : null
  }

  /**
   * 对一个列表进行修剪(trim)，就是说，让列表只保留指定区间内的元素，不在指定区间之内的元素都将被删除
   * @param key redis key
   * @param start 起始索引
   * @param stop 结束索引
   */
  async lTrim(key: string, start: number, stop: number): Promise<'OK' | null> {
    if (!key) return null
    return await this.client.ltrim(key, start, stop)
  }

  /**
   * 移除列表元素
   * @param key redis key
   * @param count
   * count > 0 ：从表头开始向表尾搜索，移除与 value 相等的元素，数量为 count；
   * count < 0 ：从表尾开始向表头搜索，移除与 value 相等的元素，数量为 count 的绝对值；
   * count = 0 ： 移除表中所有与 value 相等的值
   * @param val 待移除的值
   */
  async lRemove(key: string, count: number, val: string): Promise<number> {
    if (!key) return 0
    return await this.client.lrem(key, count, val)
  }

  /**
   * 阻塞式把 sourceKey 列表最后一个元素移到 destinationKey 列表头部并返回
   * - 如果列表没有元素会阻塞队列直到等待超时或发现可弹出元素为止
   * @param sourceKey 源列表 key
   * @param destinationKey 目标列表 key
   * @param timeout 阻塞超时（秒）
   */
  async lPoplPush(sourceKey: string, destinationKey: string, timeout: number): Promise<string> {
    if (!sourceKey || !destinationKey) return null
    return await this.client.brpoplpush(sourceKey, destinationKey, timeout)
  }
}
