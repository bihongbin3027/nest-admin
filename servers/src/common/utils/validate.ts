// https://github.com/VincentSit/ChinaMobilePhoneNumberRegex/blob/master/README-CN.md

/**
 * 校验中国大陆手机号
 * - 支持 +86 / 86 前缀，覆盖三大运营商现有号段
 * @param phone 待校验字符串
 * @returns true 表示合法
 */
export function validPhone(phone: string): boolean {
  const regx =
    /^(?:\+?86)?1(?:3\d{3}|5[^4\D]\d{2}|8\d{3}|7(?:[0-35-9]\d{2}|4(?:0\d|1[0-2]|9\d))|9[0-35-9]\d{2}|6[2567]\d{2}|4(?:(?:10|4[01])\d{3}|[68]\d{4}|[579]\d{2}))\d{6}$/
  return regx.test(phone)
}

/**
 * 校验邮箱格式（基础正则，未做 RFC 5321 完整覆盖）
 * @param email 待校验字符串
 * @returns true 表示合法
 */
export function validEmail(email: string): boolean {
  const regx = /^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/
  return regx.test(email)
}
