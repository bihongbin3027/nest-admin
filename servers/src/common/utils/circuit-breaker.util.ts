import pLimit from 'p-limit'
type Limit = (fn: () => Promise<any>) => Promise<any>
import CircuitBreaker from 'opossum'

/**
 * 【P1-3】限流 + 熔断工具
 *
 * - LimitFn：p-limit 包装，控制并发数（避免瞬时打爆第三方 API rate limit）
 * - wrapWithBreaker：opossum 包装，错误率超阈值时打开熔断器，短路快速失败
 *
 * 设计要点：
 * - 熔断器打开时**快速失败**（不调用底层），避免故障扩散
 * - 超时半开探测（30s 后尝试一次），成功则关闭熔断器
 * - 熔断状态通过回调上报到 Prometheus（rag_circuit_breaker_state）
 */

export interface LimitOpts {
  /** 最大并发数（默认 5） */
  concurrency?: number
}

export interface BreakerOpts {
  /** 熔断器名（用于日志和指标标签） */
  name: string
  /** 触发熔断的连续失败次数（默认 5） */
  errorThresholdPercentage?: number
  /** 熔断器打开时长 ms（默认 30000） */
  resetTimeout?: number
  /** 单次调用超时 ms（默认 30000） */
  timeout?: number
  /** 采样窗口大小（默认 10） */
  rollingCountTimeout?: number
  /** 熔断器状态变化回调（用于上报指标） */
  onStateChange?: (state: 'closed' | 'open' | 'halfOpen') => void
}

/**
 * 创建一个并发限流函数
 * - 用法：const limited = createLimit({ concurrency: 5 }); await limited(() => fetch(...))
 * - 超过并发数的任务会排队等待
 */
export function createLimit(opts: LimitOpts = {}): Limit {
  return pLimit(opts.concurrency ?? 5)
}

/**
 * 用熔断器包装异步函数
 * - 用法：const safe = wrapWithBreaker(riskyCall, { name: 'embedding' })
 * - 底层函数连续失败 → 熔断器打开 → 后续调用立即失败（不真正执行）
 * - resetTimeout 后熔断器半开探测（尝试一次），成功则关闭
 */
export function wrapWithBreaker<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  opts: BreakerOpts,
): (...args: TArgs) => Promise<TResult> {
  const breaker = new CircuitBreaker(fn, {
    timeout: opts.timeout ?? 30000,
    errorThresholdPercentage: opts.errorThresholdPercentage ?? 50,
    resetTimeout: opts.resetTimeout ?? 30000,
    rollingCountTimeout: opts.rollingCountTimeout ?? 10000,
    rollingCountBuckets: 10,
    name: opts.name,
  })

  // 状态变化回调：上报 Prometheus / 日志
  // 初始化时立刻上报 closed 状态，让 Prometheus gauge 立即可见（不然首次失败前无数据点）
  if (opts.onStateChange) opts.onStateChange('closed')
  breaker.on('open', () => {
    if (opts.onStateChange) opts.onStateChange('open')
    // eslint-disable-next-line no-console
    console.warn(`[CircuitBreaker ${opts.name}] 熔断器 OPEN（连续失败超过阈值）`)
  })
  breaker.on('halfOpen', () => {
    if (opts.onStateChange) opts.onStateChange('halfOpen')
  })
  breaker.on('close', () => {
    if (opts.onStateChange) opts.onStateChange('closed')
    // eslint-disable-next-line no-console
    console.log(`[CircuitBreaker ${opts.name}] 熔断器 CLOSE（恢复）`)
  })

  return ((...args: TArgs) => breaker.fire(...args)) as (...args: TArgs) => Promise<TResult>
}

/**
 * 限流 + 熔断组合包装：先限流（控制并发），再熔断（错误短路）
 * - 最常用的 LLM/embedding 调用模式
 */
export function limitAndBreaker<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  limitOpts: LimitOpts,
  breakerOpts: BreakerOpts,
): (...args: TArgs) => Promise<TResult> {
  const limit = createLimit(limitOpts)
  const wrapped = wrapWithBreaker(fn, breakerOpts)
  return ((...args: TArgs) => limit(() => wrapped(...args))) as (...args: TArgs) => Promise<TResult>
}