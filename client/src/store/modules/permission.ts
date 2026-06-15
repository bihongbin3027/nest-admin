import { ref, type Ref } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { defineStore } from 'pinia'

import store from '@/store'

import type { MenuApiResult } from '@/api/menu'
import { asyncRoutes, constantRoutes } from '@/router/index'

/**
 * 判断路由是否有权限。后端 /perm/menu 会按角色裁剪出当前用户拥有的菜单 code 列表。
 *
 * 判定规则（按优先级）：
 * 1. hidden=true 的路由直接放行（侧边栏隐藏不代表无权限访问）
 * 2. 目录型路由（有 redirect + children 但自身不是具体页面）：只允许"递归子级至少一个命中"通过
 *    —— 这是关键兜底：万一后端 SQL 漏过滤、推了 sys_menu 全表过来，
 *       目录路由不能凭自身 code 命中放行（否则会带着一堆没权限的子菜单一起出现），
 *       必须靠子路由的 code 命中来"激活"它
 * 3. 叶子路由：route.name 命中后端任一 menu.code → 有权限
 */
const isDirectoryRoute = (route: RouteRecordRaw): boolean => {
  // 容器型路由：有 redirect 指向子页 + 有 children + 自身是 Layout 容器
  return !!(route.redirect && route.children && route.children.length > 0)
}

const hasPermission = (route: RouteRecordRaw, menus: MenuApiResult[]): boolean => {
  // hidden 路由跳过权限判断
  if (route.meta?.hidden) return true

  // 目录型路由：自身 code 命中不算，必须看子级（防后端漏过滤）
  if (isDirectoryRoute(route)) {
    for (let i = 0; i < route.children!.length; i++) {
      if (hasPermission(route.children![i], menus)) {
        return true
      }
    }
    return false
  }

  // 叶子路由：name 命中后端 code 即视为有权限
  if (route.name && menus.some((menu) => menu.code === route.name)) {
    return true
  }

  // 非目录且无 name 命中的（比如纯嵌套子路由）→ 看子级
  if (route.children && route.children.length > 0) {
    for (let i = 0; i < route.children.length; i++) {
      if (hasPermission(route.children[i], menus)) {
        return true
      }
    }
  }

  return false
}

/** 递归遍历路由权限 */
const filterAsyncRoutes = (routes: RouteRecordRaw[], menus: MenuApiResult[]): RouteRecordRaw[] => {
  const res: RouteRecordRaw[] = []
  routes.forEach((route) => {
    const tmp = { ...route }
    if (hasPermission(tmp, menus)) {
      if (tmp.children && tmp.children.length > 0) tmp.children = filterAsyncRoutes(tmp.children, menus)
      res.push(tmp)
    }
  })
  return res
}

export const usePermissionStore = defineStore('permission', () => {
  const routes: Ref<RouteRecordRaw[]> = ref<RouteRecordRaw[]>([])
  const dynamicRoutes: Ref<RouteRecordRaw[]> = ref<RouteRecordRaw[]>([])
  const setRoutes = (menus: MenuApiResult[]) => {
    dynamicRoutes.value = filterAsyncRoutes(asyncRoutes, menus)
    routes.value = constantRoutes.concat(dynamicRoutes.value)
    return dynamicRoutes.value
  }
  return { routes, dynamicRoutes, setRoutes }
})

/** 在 setup 外使用 */
export function usePermissionStoreHook() {
  return usePermissionStore(store)
}
