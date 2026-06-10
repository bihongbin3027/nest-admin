/** DI token for the ioredis client instance. */
/**
 * 单独放常量文件，避免 redis.service.ts / redis.module.ts 之间形成循环导入：
 * 否则 service 里 @Inject(REDIS_CLIENT) 拿到的会是 undefined（module 还没执行到 export 那一行），
 * NestJS 会报 UndefinedDependencyException。
 */
export const REDIS_CLIENT = 'REDIS_CLIENT'
