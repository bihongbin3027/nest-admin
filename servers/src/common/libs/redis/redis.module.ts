import { DynamicModule, Provider } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import Redis, { RedisOptions } from 'ioredis'

import { REDIS_CLIENT } from './redis.constants'
import { RedisService } from './redis.service'

// 重新导出，方便业务侧仍然可以 `import { REDIS_CLIENT } from '.../redis.module'`
export { REDIS_CLIENT }

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
export class RedisModule {
  /**
   * 不再使用 @liaoliaots/nestjs-redis,直接用 ioredis 创建客户端
   * 业务侧 RedisService 公开方法签名零变化,无需改任何 service
   */
  static forRootAsync(options: RedisModuleOptions, isGlobal = true): DynamicModule {
    const redisProvider: Provider = {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const client = new Redis(options.useFactory(config))
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
