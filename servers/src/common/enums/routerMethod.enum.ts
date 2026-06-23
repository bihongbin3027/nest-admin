/**
 * 标准 HTTP 请求方法枚举
 * - 用于审计日志、菜单 perm 标识、动态路由注册等场景
 * - 字符串值与 HTTP 协议标准动词保持一致，避免大小写不一致导致匹配失败
 */
export enum RouterMethods {
  /** HTTP GET：幂等读取 */
  GET = 'GET',
  /** HTTP POST：创建资源 */
  POST = 'POST',
  /** HTTP PUT：全量更新 */
  PUT = 'PUT',
  /** HTTP DELETE：删除资源 */
  DELETE = 'DELETE',
}