/**
 * Redis 客户端的 DI token（字符串标识符）
 * - 单独放常量文件，避免 redis.service.ts / redis.module.ts 之间形成循环导入：
 *   否则 service 里 @Inject(REDIS_CLIENT) 拿到的会是 undefined（module 还没执行到 export 那一行），
 *   NestJS 会报 UndefinedDependencyException。
 * - 业务侧 service 一般注入 RedisService，而不是直接拿 client；如需拿到原生 ioredis 客户端可调用 RedisService.getClient()
 */
export const REDIS_CLIENT = 'REDIS_CLIENT'
