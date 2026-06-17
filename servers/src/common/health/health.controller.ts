import { Controller, Get } from '@nestjs/common'
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  DiskHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus'

/**
 * 【P1-1】健康检查端点
 * - GET /api/health      综合健康检查（DB + 磁盘 + 内存）
 * - GET /api/health/live  存活探针（k8s livenessProbe）
 * - GET /api/health/ready 就绪探针（k8s readinessProbe）
 *
 * 生产环境 k8s 配置：
 *   livenessProbe:   /api/health/live   → fail 时重启 pod
 *   readinessProbe:  /api/health/ready  → fail 时从 service endpoints 摘除
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // MySQL 连接
      () => this.db.pingCheck('database', { timeout: 1500 }),
      // 磁盘空间：剩余 < 20% 报错（path 用 process.cwd() 跨平台）
      () =>
        this.disk.checkStorage('disk', {
          thresholdPercent: 0.8,
          path: process.cwd(),
        }),
      // 内存：heap < 300MB 报错
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      // RSS < 500MB 报错
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
    ])
  }

  @Get('live')
  @HealthCheck()
  live() {
    // 存活探针：进程在跑就 OK，不查外部依赖
    return this.health.check([() => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024)])
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    // 就绪探针：能处理请求 = DB 可连 + 内存够
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 1500 }),
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
    ])
  }
}