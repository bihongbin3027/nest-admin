import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm'

/**
 * 审计日志表
 * 记录谁在什么时间、什么 IP、调用了哪个 RAG 接口、操作了什么资源、结果如何
 * 满足企业 SaaS 等保 / GDPR 追溯要求
 *
 * 设计要点：
 * - 异步写入（fire-and-forget），不阻塞业务请求
 * - 失败兜底 log warn，绝不让审计写入失败导致业务 500
 * - 加索引：user_id + created_at（用户维度倒序翻页）、action（按操作类型筛选）
 */
@Entity({ name: 'sys_audit_log' })
@Index('IDX_AUDIT_USER_TIME', ['userId', 'createdAt'])
@Index('IDX_AUDIT_ACTION', ['action'])
export class AuditLogEntity {
  /** 主键 ID（自增） */
  @PrimaryGeneratedColumn({ comment: '主键ID' })
  id: number

  /** 操作用户 ID（未登录或匿名请求为 null） */
  @Column({ type: 'int', name: 'user_id', nullable: true, comment: '操作用户ID（未登录为 NULL）' })
  userId: number | null

  /** 操作类型，由 AuditInterceptor 从 method + url 模式推断得到（如 upload_file / delete_file / ask_stream） */
  @Column({ type: 'varchar', length: 64, comment: '操作类型（如 upload_file / delete_file / ask_stream）' })
  action: string

  /** 资源类型（如 rag_file / rag_session / rag_folder / rag_chat），无法识别时为 null */
  @Column({ type: 'varchar', length: 32, name: 'resource_type', nullable: true, comment: '资源类型（如 rag_file / rag_session）' })
  resourceType: string | null

  /** 资源主键 ID（如 rag_file.id）；list 类操作无具体 ID 时为 null */
  @Column({ type: 'int', name: 'resource_id', nullable: true, comment: '资源ID（如 fileId）' })
  resourceId: number | null

  /** HTTP 请求方法（GET / POST / DELETE / PATCH / PUT） */
  @Column({ type: 'varchar', length: 10, comment: 'HTTP 方法（GET/POST/DELETE/PATCH）' })
  method: string

  /** 完整请求 URL（含 query string）；写入时已截断到 varchar(255) 上限 */
  @Column({ type: 'varchar', length: 255, comment: '请求 URL' })
  url: string

  /** HTTP 响应状态码（200/201/400/401/403/404/500/499 等） */
  @Column({ type: 'int', name: 'status_code', comment: 'HTTP 状态码' })
  statusCode: number

  /** 客户端真实 IP（按 req.ip → x-forwarded-for → remoteAddress 顺序回退） */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '客户端 IP' })
  ip: string | null

  /** 错误信息（statusCode >= 400 时记录，截断到 500 字符；正常请求为 null） */
  @Column({ type: 'text', name: 'error_message', nullable: true, comment: '错误信息（status_code >= 400 时记录）' })
  errorMessage: string | null

  /** 操作时间（由 TypeORM 自动写入，数据库侧默认值 NOW） */
  @CreateDateColumn({ type: 'datetime', name: 'created_at', comment: '操作时间' })
  createdAt: Date
}