/**
 * 通用业务枚举集合
 * - 聚合用户类型、账号状态、菜单类型等基础枚举值
 * - 与具体业务模块解耦，供 service / entity / 前端枚举映射共用
 */

/**
 * 用户类型枚举
 * - 区分超管与普通用户，用作 `RolesGuard` / Controller 内主动校验分支
 * - 数据库 user.type 字段存储枚举的数值（0 / 1）
 */
export enum UserType {
  /** 超级管理员：拥有全部接口权限（RolesGuard 直接放行） */
  SUPER_ADMIN = 0,
  /** 普通用户：权限由 `findUserPerms` 返回的路由白名单决定 */
  ORDINARY_USER = 1,
}

/**
 * 通用启用 / 禁用状态枚举
 * - 数据库大多数表的 status 字段共用此枚举
 * - 1 表示正常，0 表示禁用（删除也常用 0 表示软删除）
 */
export enum StatusValue {
  /** 禁用 / 停用 / 已删除 */
  FORBIDDEN = 0,
  /** 正常启用 */
  NORMAL = 1,
}

/**
 * 菜单类型枚举
 * - 与 `menu.type` 字段对应
 * - 前端根据类型决定渲染：菜单项 / Tabs 页面 / 按钮级权限
 */
export enum MenuType {
  /** 左侧菜单 / 路由级菜单 */
  MENU = 1,
  /** Tabs 多页签类型菜单（不进入左侧菜单树） */
  TAB = 2,
  /** 按钮级别（用于细粒度按钮权限控制） */
  BUTTON = 3,
}