import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuditLogEntity } from './audit-log.entity'

/**
 * 审计日志写入服务
 *
 * 设计要点：
 * - 异步 fire-and-forget：审计写入不阻塞业务请求
 * - 失败兜底 log warn：审计写入失败绝不让业务 500
 * - 单条 INSERT：sys_audit_log 是追加型日志表，不需要事务
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name)

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository: Repository<AuditLogEntity>,
  ) {}

  /**
   * 记录一条审计日志（异步 + 兜底）
   * - 单条 INSERT：sys_audit_log 是追加型日志表，无需事务
   * - url 截断：避免超过 varchar(255) 报错
   * - 失败兜底：写入失败仅 log warn，绝不让审计问题导致业务 500
   * @param entry 审计条目（含 userId / action / method / url / statusCode 等）
   * @returns Promise，无显式返回值；调用方无需 await（fire-and-forget）
   */
  async log(entry: {
    userId: number | null
    action: string
    resourceType?: string | null
    resourceId?: number | null
    method: string
    url: string
    statusCode: number
    ip?: string | null
    errorMessage?: string | null
  }): Promise<void> {
    try {
      await this.auditLogRepository.insert({
        userId: entry.userId,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        method: entry.method,
        url: entry.url.slice(0, 255), // 截断到 255 字符，防止超 sys_audit_log.url 的 varchar(255) 上限
        statusCode: entry.statusCode,
        ip: entry.ip ?? null,
        errorMessage: entry.errorMessage ?? null,
      })
    } catch (err: any) {
      this.logger.warn(
        `[AuditLog] 写入失败 action=${entry.action} userId=${entry.userId} url=${entry.url}: ${err?.message || err}`,
      )
    }
  }
}