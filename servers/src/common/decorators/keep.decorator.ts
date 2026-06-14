import { SetMetadata } from '@nestjs/common'

// 定义跳过全局拦截器的唯一 Key（这个 Key 要和你的全局响应拦截器里判断的 Key 一致）
export const KEEP_KEY = 'common:keep_transform'

// 创建自定义装饰器 @Keep()
export const Keep = () => SetMetadata(KEEP_KEY, true)
