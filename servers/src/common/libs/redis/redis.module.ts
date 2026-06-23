import { DynamicModule, Provider } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import Redis, { RedisOptions } from 'ioredis'

import { REDIS_CLIENT } from './redis.constants'
import { RedisService } from './redis.service'

// 重新导出，方便业务侧仍然可以 `import { REDIS_CLIENT } from '.../redis.module'`
export { REDIS_CLIENT }

/**
 * RedisModule 异步注册选项
 * - useFactory 由业务侧实现，从 ConfigService 读取 redis.* 配置构造 ioredis RedisOptions
 */
export interface RedisModuleOptions {
  useFactory: (config: ConfigService) => RedisOptions
}

// class 上不放任何装饰器 —— REDIS_CLIENT 常量拆到 redis.constants.ts，
// 是为了打破和 redis.service.ts 之间的循环导入：
//   redis.service.ts  →  import { REDIS_CLIENT } from './redis.module'
//   redis.module.ts   →  import { RedisService }   from './redis.service'
// Node require 缓存命中时 service 里拿到的 REDIS_CLIENT 是 undefined，
// @Inject(undefined) 写进 SELF_DECLARED_DEPS_METADATA，DI 容器报 UndefinedDependencyException。
// class 本身只是个命名空间容器，所有 providers / imports / global 都交给 forRootAsync 返回的 DynamicModule。

/**
 * 自封装 RedisModule（替代弃用的 @liaoliaots/nestjs-redis）
 * - 直接用 ioredis 创建客户端，client 通过 REDIS_CLIENT token 注入到 RedisService
 * - 默认 global，业务侧 module 不需要再显式 imports: [RedisModule]
 * - 在 AppModule 里调用 RedisModule.forRootAsync({ useFactory }) 即可启动
 */
export class RedisModule {
  /**
   * 不再使用 @liaoliaots/nestjs-redis,直接用 ioredis 创建客户端
   * 业务侧 RedisService 公开方法签名零变化,无需改任何 service
   * @param options 异步配置（从 ConfigService 构造 ioredis RedisOptions）
   * @param isGlobal 是否注册为全局模块（默认 true）
   */
  static forRootAsync(options: RedisModuleOptions, isGlobal = true): DynamicModule {
    const redisProvider: Provider = {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const client = new Redis(options.useFactory(config))
        // 连接 ready / error 在控制台打印一行，生产环境由 log4js 收集 stdout
        client.on('ready', () => {
          console.log('[Redis] client ready')
        })
        client.on('error', (err) => {
          console.error('[Redis] client error:', err.message)
        })
        return client
      },
    }

    return {
      module: RedisModule,
      global: isGlobal,
      imports: [ConfigModule],
      providers: [redisProvider, RedisService],
      exports: [REDIS_CLIENT, RedisService],
    }
  }
}
