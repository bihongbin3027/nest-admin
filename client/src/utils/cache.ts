import jwtDecode from 'jwt-decode'

import type { ThemeName } from '_hooks'

export enum CacheKey {
  /** 左侧导航栏 */
  SIDEBAR_STATUS = 'sidebar-status',
  ACTIVE_THEME_NAME = 'active-theme-name',
  TOKEN = 'token',
  REFRESH_TOKEN = 'refresh-token',
  REFRESH_TOKEN_EXP = 'rt-exp'
}
interface ItokenDecode {
  id?: string
  iat: number
  exp: number
}

/**
 * 存储 token 顺带存储 refreshToken
 * token 过期后，会自动根据 refreshToken 刷新 token
 * 如果 refreshToken 过期则必须重新登录
 * @param token
 * @param refreshToken
 */
export function setToken(token: string, refreshToken: string): void {
  localStorage.setItem(CacheKey.TOKEN, token)
  setRefreshToken(refreshToken)
  // 解析过期时间，设置过期
  const rtExp = (jwtDecode(refreshToken) as ItokenDecode)?.exp * 1000
  setRTExp(rtExp)
}

export function getToken(): string | null {
  return localStorage.getItem(CacheKey.TOKEN)
}

export function setRefreshToken(refreshToken: string): void {
  localStorage.setItem(CacheKey.REFRESH_TOKEN, refreshToken)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(CacheKey.REFRESH_TOKEN)
}

export function setRTExp(exp: number): void {
  localStorage.setItem(CacheKey.REFRESH_TOKEN_EXP, `${exp}`)
}
export function getRTExp(): number {
  const rtExpStr = localStorage.getItem(CacheKey.REFRESH_TOKEN_EXP)
  return rtExpStr ? Number(rtExpStr) : 0
}

export function getSidebarStatus() {
  return localStorage.getItem(CacheKey.SIDEBAR_STATUS)
}
export function setSidebarStatus(sidebarStatus: 'opened' | 'closed') {
  localStorage.setItem(CacheKey.SIDEBAR_STATUS, sidebarStatus)
}

export function getActiveThemeName() {
  return localStorage.getItem(CacheKey.ACTIVE_THEME_NAME) as ThemeName
}
export function setActiveThemeName(themeName: ThemeName) {
  localStorage.setItem(CacheKey.ACTIVE_THEME_NAME, themeName)
}

/**
 * 退出登录 / 会话失效时调用。
 * 仅清掉"会话相关"key（token、refreshToken、rt-exp），**不动**用户终端设置（主题、侧边栏、记住的账号密码）。
 * 老实现用 `localStorage.clear()` 会把 RAG_TERMINAL_CREDENTIAL 一起干掉，
 * 导致"记住此终端"功能在退出后失效。
 */
export function clearLocalStorage() {
  localStorage.removeItem(CacheKey.TOKEN)
  localStorage.removeItem(CacheKey.REFRESH_TOKEN)
  localStorage.removeItem(CacheKey.REFRESH_TOKEN_EXP)
}
