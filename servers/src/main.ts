import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { mw as requestIpMw } from 'request-ip'

import express from 'express'
import path from 'path'

import { NestFactory, Reflector } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'

import { AppModule } from './app.module'

import { logger } from './common/libs/log4js/logger.middleware'
import { Logger } from './common/libs/log4js/log4j.util'
import { TransformInterceptor } from './common/libs/log4js/transform.interceptor'
import { HttpExceptionsFilter } from './common/libs/log4js/http-exceptions-filter'
import { ExceptionsFilter } from './common/libs/log4js/exceptions-filter'

import Chalk from 'chalk'

/**
 * Nest Admin 后端启动入口（bootstrap 函数）
 * - 完成 NestFactory 全局配置：安全头、限流、Swagger、参数校验、统一日志、统一响应包装、全局异常过滤器
 * - 通过 ConfigService 读取 `app.prefix`（默认 `/api`）与 `app.port`（默认 8080）
 * - 启动完成后打印上传目录、服务地址、Swagger 文档地址等运维信息
 *
 * 配置要点：
 * - 反代场景必须设置 `trust proxy = loopback`，否则 `req.ip` 拿不到真实客户端 IP
 * - `rateLimit` 在反代链路中也是基于 `req.ip` 计数的，缺这步会把整条 CDN 当成同一个客户端
 * - `helmet` 默认开启多项安全头，开发环境如使用 ServeStaticModule 暴露静态资源需关闭 `crossOriginResourcePolicy`
 */
async function bootstrap() {
  // 创建 NestFactory 实例，启用 CORS 允许跨域请求
  const app = await NestFactory.create(AppModule, {
    cors: true,
  })

  // 用于 TransformInterceptor 通过反射读取 @Keep() / @SetMetadata 等元数据
  const reflector = app.get(Reflector)

  // 反向代理场景下必须显式声明 trust proxy，express-rate-limit / request-ip 等中间件依赖 req.ip
  // 详见 https://expressjs.com/en/guide/behind-proxies.html
  // loopback 表示只信任 127.0.0.1/::1 这一段代理，避免被任意客户端伪造 X-Forwarded-For
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback')

  // 设置全局访问频率限制（基于 IP），防止恶意刷接口
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 滑动窗口：15 分钟
      limit: 1000, // 单窗口最多 1000 次（express-rate-limit 7+ 用 `limit` 替换旧的 `max`）
      standardHeaders: 'draft-7', // 走 RFC draft-7 的 RateLimit-* 响应头，客户端可解析
    }),
  )

  const config = app.get(ConfigService)

  // 设置全局路由前缀（默认 /api），所有 Controller 都自动加上此前缀
  const prefix = config.get<string>('app.prefix')
  app.setGlobalPrefix(prefix)

  // 启用 helmet 安全中间件：注入 X-Frame-Options / X-Content-Type-Options 等常用安全头
  // 注意：开发环境如果同时启用了 nest ServeStaticModule，需要把 crossOriginResourcePolicy 设为 false
  // 否则静态资源跨域加载会失败
  // { crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, crossOriginResourcePolicy: false }
  app.use(helmet({ crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, crossOriginResourcePolicy: false }))

  // 构建 Swagger 文档配置
  const swaggerOptions = new DocumentBuilder()
    .setTitle('Nest-Admin App')
    .setDescription('Nest-Admin App 接口文档')
    .setVersion('2.0.0')
    .addBearerAuth() // 启用 Bearer 鉴权按钮（与 JWT 鉴权配合）
    .build()
  const document = SwaggerModule.createDocument(app, swaggerOptions)
  // 项目依赖当前文档功能，最好不要改变当前地址
  // 生产环境使用 nginx 可以将当前文档地址 屏蔽外部访问
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 刷新页面后保留已输入的 Token
    },
    customSiteTitle: 'Nest-Admin API Docs',
  })

  // 解析客户端真实 IP（依赖上面 trust proxy 配置），挂到 req.ip
  app.use(requestIpMw({ attributeName: 'ip' }))

  // 启用全局参数校验：
  // - transform: 自动根据 DTO 类型转换入参（如 query 字符串转 number）
  // - enableDebugMessages / disableErrorMessages: 开发环境给出更多错误信息
  // - forbidUnknownValues: false 允许未知键，避免 class-validator 严格模式报错
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      enableDebugMessages: true, // 开发环境
      disableErrorMessages: false,
      forbidUnknownValues: false,
    }),
  )

  // 挂载 express 基础中间件
  app.use(express.json()) // 解析 application/json 请求体
  app.use(express.urlencoded({ extended: true })) // 解析表单请求体
  // 注册 log4js 请求日志中间件（记录 method/url/ip/duration 等）
  app.use(logger)
  // 全局拦截器：把返回值统一包装成 { code, msg, data } 格式
  // 通过 @Keep() 装饰器可跳过本拦截器（SSE / 文件下载等场景）
  app.useGlobalInterceptors(new TransformInterceptor(reflector))
  // 注册两个全局异常过滤器：覆盖常规异常与 HTTP 异常，统一响应错误结构
  app.useGlobalFilters(new ExceptionsFilter())
  app.useGlobalFilters(new HttpExceptionsFilter())
  // 启动 HTTP 服务，端口从配置读取，默认 8080
  const port = config.get<number>('app.port') || 8080
  await app.listen(port)

  // 计算上传目录的绝对路径（兼容配置写相对路径的情况）
  const fileUploadLocationConfig = config.get<string>('app.file.location') || '../upload'
  const fileUploadBastPath = path.normalize(
    path.isAbsolute(fileUploadLocationConfig)
      ? `${fileUploadLocationConfig}`
      : path.join(process.cwd(), `${fileUploadLocationConfig}`),
  )
  // 打印启动日志，方便运维快速确认端口、文档地址、上传目录
  Logger.log(
    Chalk.green('Nest-Admin 服务启动成功 '),
    '\n',
    Chalk.green('上传文件存储路径'),
    `        ${fileUploadBastPath}`,
    '\n',
    Chalk.green('服务地址'),
    `                http://localhost:${port}${prefix}/`,
    '\n',
    Chalk.green('swagger 文档地址        '),
    `http://localhost:${port}${prefix}/docs/`,
  )
}

bootstrap()