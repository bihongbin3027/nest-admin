import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm'
import { ServeStaticModule, ServeStaticModuleOptions } from '@nestjs/serve-static'
import { APP_GUARD } from '@nestjs/core'
import { PrometheusModule } from '@willsoto/nestjs-prometheus'
import path from 'path'

import configuration from './config/index'
import { RedisOptions } from 'ioredis'

import { RedisModule } from './common/libs/redis/redis.module'
import { JwtAuthGuard } from './common/guards/auth.guard'
import { RolesGuard } from './common/guards/roles.guard'
import { HealthModule } from './common/health/health.module'
import { MetricsModule } from './common/metrics/metrics.module'
import { BullModule } from '@nestjs/bullmq'

import { UserModule } from './system/user/user.module'
import { AuthModule } from './system/auth/auth.module'
import { MenuModule } from './system/menu/menu.module'
import { RoleModule } from './system/role/role.module'
import { PermModule } from './system/perm/perm.module'
import { OssModule } from './system/oss/oss.module'
import { DeptModule } from './system/dept/dept.module'
import { PostModule } from './system/post/post.module'
import { RagModule } from './system/rag/rag.module'

/**
 * 应用根模块（AppModule）
 * - 装配顺序：基础设施（配置 / ORM / Redis / 队列 / 监控 / 健康）→ 业务模块 → 全局守卫
 *
 * 装配清单：
 * 1. ConfigModule：基于 NODE_ENV 加载 YAML 配置（dev/test/prod/docker）
 * 2. ServeStaticModule：把 `app.file.location` 目录映射为静态资源（默认 /static）
 * 3. TypeOrmModule：MySQL 连接池，autoLoadEntities 自动扫描 *.entity.ts
 * 4. RedisModule：自封装 ioredis（替代 @liaoliaots/nestjs-redis）
 * 5. PrometheusModule：暴露 /metrics 抓取端点
 * 6. HealthModule：暴露 /health / /health/live / /health/ready
 * 7. MetricsModule：RAG 业务自定义指标（@Global 装饰）
 * 8. BullModule：ETL 异步任务队列
 * 9. 业务模块：User / Auth / Menu / Role / Perm / Dept / Post / Oss / Rag
 * 10. 全局守卫：JwtAuthGuard + RolesGuard（依赖 UserService / PermService，不能在 main.ts 注册）
 */
@Module({
  imports: [
    // 配置模块：YAML 文件读取，按 NODE_ENV 自动选择 dev/test/prod/docker 配置
    ConfigModule.forRoot({
      cache: true,
      load: [configuration],
      isGlobal: true,
    }),
    // 服务静态化：把上传目录以 HTTP 路径对外暴露
    // 生产环境建议使用 nginx 做资源映射，可以按环境配置做区分
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const fileUploadLocationConfig = config.get<string>('app.file.location') || '../upload'
        const rootPath = path.isAbsolute(fileUploadLocationConfig)
          ? `${fileUploadLocationConfig}`
          : path.join(process.cwd(), `${fileUploadLocationConfig}`)
        return [
          {
            rootPath,
            // exclude 配置项用于排除自身 API 前缀，避免与业务接口冲突
            exclude: [`${config.get('app.prefix')}`],
            serveRoot: config.get('app.file.serveRoot'),
            serveStaticOptions: {
              cacheControl: true,
            },
          },
        ] as ServeStaticModuleOptions[]
      },
    }),
    // 数据库：MySQL 连接（详细配置见 config/dev.yml 的 db.mysql 段）
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          type: 'mysql',
          // 可能不再支持这种方式，entities 将改成接收 实体类的引用
          //
          // entities: [`${__dirname}/**/*.entity{.ts,.js}`],
          autoLoadEntities: true, // 自动加载 entities 目录下的实体文件
          ...config.get('db.mysql'),
          // cache: {
          //   type: 'ioredis',
          //   ...config.get('redis'),
          //   alwaysEnabled: true,
          //   duration: 3 * 1000, // 缓存3s
          // },
        } as TypeOrmModuleOptions
      },
    }),
    // libs redis：自封装 ioredis，弃用 @liaoliaots/nestjs-redis
    RedisModule.forRootAsync(
      {
        useFactory: (config: ConfigService) => config.get<RedisOptions>('redis'),
      },
      true, // 第二个参数为 true 时将 RedisService 注册为全局模块
    ),
    // Prometheus 指标抓取端点 /metrics（默认启用 HTTP 请求时长等基础指标）
    // path 必须配在 JwtAuthGuard 之外，否则需要 token 才能抓指标（运维抓不到）
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
    // 健康检查端点 /health / health/live / health/ready（k8s probe 用）
    HealthModule,
    // RAG 业务自定义指标（RagMetricsService 全局可见，service 层直接 inject 即可）
    MetricsModule,
    // BullMQ 全局队列：ETL 任务持久化 + 重试策略 + 并发控制（替代旧版 SimpleSemaphore）
    // 必须显式剔除 keyPrefix —— BullMQ 用自己的 key 命名（bull:<queue>:<id>），
    // 如果把 dev.yml 里的 `keyPrefix: "nest:"` 透传进去，ioredis 会把 BullMQ 写的 key 改成 `nest:bull:...`，
    // Worker 完成时 `moveToFinished` Lua 脚本找不到原 job key → "Missing key for job" 报错。
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisCfg = config.get<any>('redis') || {}
        // 解构剔除 keyPrefix 后透传 connection 给 BullMQ
        const { keyPrefix: _omit, ...bullConn } = redisCfg
        return { connection: bullConn }
      },
    }),
    // 系统基础模块：用户、认证、菜单、角色、权限、部门、岗位、对象存储、RAG 知识库
    UserModule,
    AuthModule,
    MenuModule,
    RoleModule,
    PermModule,
    DeptModule,
    PostModule,
    OssModule,
    RagModule,
    // 业务功能模块
  ],
  // AppModule 全局守卫：JwtAuthGuard 与 RolesGuard 分别依赖 UserService / PermService
  // 由于 UserService、PermService 没有设置为全局模块，守卫只能在 AppModule providers 中声明，
  // 不能放到 main.ts 的 app.useGlobalGuards 中（否则会因找不到依赖而实例化失败）
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // 第一层：JWT 解析
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // 第二层：接口级权限校验（依赖 perm 表）
    },
  ],
})
export class AppModule {}