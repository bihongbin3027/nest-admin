/**
 * 应用层业务错误码枚举
 * - 与统一响应体 ResultData.fail(code, msg) 配合使用，对应响应中的 code 字段
 * - 数值按业务域分段：1xxxx 公共段；2xxxx 用户域；3xxxx 角色域；4xxxx 菜单域；5xxxx 部门域；6xxxx 岗位域；500500 兜底服务器异常
 * - 前端基于此枚举做统一的错误提示与跳转处理
 */
export enum AppHttpCode {
  /** 服务器内部异常，作为兜底错误码，业务异常优先使用细分 code */
  SERVICE_ERROR = 500500,
  /** 通用段：请求数据为空（如 Excel 导入内容为空） */
  DATA_IS_EMPTY = 100001,
  /** 通用段：请求参数校验失败（DTO/Query 校验未通过） */
  PARAM_INVALID = 100002,
  /** 通用段：上传文件 MIME / 后缀类型不在白名单 */
  FILE_TYPE_ERROR = 100003,
  /** 通用段：上传文件大小超出接口上限 */
  FILE_SIZE_EXCEED_LIMIT = 100004,
  /** 用户段：账号 / 手机号 / 邮箱 已存在，创建冲突 */
  USER_CREATE_EXISTING = 200001,
  /** 用户段：登录密码错误、两次输入密码不一致 */
  USER_PASSWORD_INVALID = 200002,
  /** 用户段：账号已被禁用（status=0） */
  USER_ACCOUNT_FORBIDDEN = 200003,
  /** 用户段：禁止改自身状态 / 普通用户禁止改超管信息 */
  USER_FORBIDDEN_UPDATE = 20004,
  /** 用户段：目标用户不存在或已删除 */
  USER_NOT_FOUND = 200004,
  /** 角色段：目标角色不存在或已删除 */
  ROLE_NOT_FOUND = 300004,
  /** 角色段：存在已绑定用户，不允许删除 */
  ROLE_NOT_DEL = 300005,
  /** 角色段：当前用户对该角色无操作权限 */
  ROLE_NO_FORBIDDEN = 300403,
  /** 菜单段：目标菜单不存在或已删除 */
  MENU_NOT_FOUND = 400004,
  /** 部门段：目标部门不存在或已删除 */
  DEPT_NOT_FOUND = 500004,
  /** 岗位段：同部门下岗位编码 / 名称重复 */
  POST_REPEAT = 600001,
  /** 岗位段：目标岗位不存在或已删除 */
  POST_NOT_FOUND = 600004,
}