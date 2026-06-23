  
import Path from 'path'
import Log4js from 'log4js'
import Util from 'util'
import dayjs from 'dayjs' // 处理时间的工具
import * as StackTrace from 'stacktrace-js'
import Chalk from 'chalk'
import config from '../../../config/index'

/**
 * log4js 二次封装 + 自定义 Nest-Admin 输出格式
 * - 静态 Logger 类对外暴露 trace/debug/info/warn/error/fatal/access 七个方法
 * - 通过 getStackTrace 自动获取调用方坐标，输出文件名(行:列)便于排障
 * - 自定义 layout 'Nest-Admin'：彩色 + 行号 + 模块名，开发环境 console，生产写文件按天切割
 */
const appLogDirConfig = config().app.logger.dir

// 把相对路径的日志目录拼接为绝对路径，兼容容器内 cwd 与本地开发
const baseLogPath = Path.normalize(
  Path.isAbsolute(appLogDirConfig) ? appLogDirConfig : Path.join(process.cwd(), appLogDirConfig),
)

const env = process.env.NODE_ENV
// 日志级别（与 log4js 原生枚举对齐，单纯为了在 TS 侧引用更友好）
export enum LoggerLevel {
  ALL = 'ALL',
  MARK = 'MARK',
  TRACE = 'TRACE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
  OFF = 'OFF',
}

/**
 * 日志内容跟踪类（用于把上下文与日志绑定）
 * - 自定义 layout 会检测 logEvent.data 中的 ContextTrace 实例并取出 context / 坐标
 * - 一般通过 Logger.trace(msg, new ContextTrace('UserService')) 这种用法传入
 */
export class ContextTrace {
  constructor(
    public readonly context: string,
    public readonly path?: string,
    public readonly lineNumber?: number,
    public readonly columnNumber?: number,
  ) {}
}

Log4js.addLayout('Nest-Admin', (logConfig: any) => {
  return (logEvent: Log4js.LoggingEvent): string => {
    let moduleName = ''
    let position = ''

    // 日志组装
    const messageList: string[] = []
    logEvent.data.forEach((value: any) => {
      if (value instanceof ContextTrace) {
        moduleName = value.context
        // 显示触发日志的坐标（行，列）
        if (value.lineNumber && value.columnNumber) {
          position = `${value.lineNumber}, ${value.columnNumber}`
        }
        return
      }

      if (typeof value !== 'string') {
        value = Util.inspect(value, false, 3, true)
      }

      messageList.push(value)
    })

    // 日志组成部分
    const messageOutput: string = messageList.join(' ')
    const positionOutput: string = position ? ` [${position}]` : ''
    const typeOutput = `[${logConfig.type}] ${logEvent.pid.toString()} - `
    const dateOutput = `${dayjs(logEvent.startTime).format('YYYY/MM/DD HH:mm:ss')}`
    const moduleOutput: string = moduleName ? `[${moduleName}] ` : '[LoggerService] '
    let levelOutput = `[${logEvent.level}] ${messageOutput}`

    // 根据日志级别，用不同颜色区分
    switch (logEvent.level.toString()) {
      case LoggerLevel.DEBUG:
        levelOutput = Chalk.green(levelOutput)
        break
      case LoggerLevel.INFO:
        levelOutput = Chalk.cyan(levelOutput)
        break
      case LoggerLevel.WARN:
        levelOutput = Chalk.yellow(levelOutput)
        break
      case LoggerLevel.ERROR:
        levelOutput = Chalk.red(levelOutput)
        break
      case LoggerLevel.FATAL:
        levelOutput = Chalk.hex('#DD4C35')(levelOutput)
        break
      default:
        levelOutput = Chalk.grey(levelOutput)
        break
    }

    return `${Chalk.green(typeOutput)}${dateOutput}  ${Chalk.yellow(moduleOutput)}${levelOutput}${positionOutput}`
  }
})

const log4jsConfigure = {
  appenders: {
    access: {
      type: 'dateFile',
      filename: `${baseLogPath}/access/access.log`,
      alwaysIncludePattern: true,
      pattern: 'yyyyMMdd',
      daysToKeep: 60,
      numBackups: 3,
      category: 'http',
      keepFileExt: true,
    },
    app: {
      type: 'dateFile',
      filename: `${baseLogPath}/app-out/app.log`,
      alwaysIncludePattern: true,
      layout: {
        type: 'pattern',
        pattern: '{"date":"%d","level":"%p","category":"%c","host":"%h","pid":"%z","data":\'%m\'}',
      },
      // 日志文件按日期（天）切割
      pattern: 'yyyyMMdd',
      daysToKeep: 60,
      // maxLogSize: 10485760,
      numBackups: 3,
      keepFileExt: true,
    },
    errorFile: {
      type: 'dateFile',
      filename: `${baseLogPath}/errors/error.log`,
      alwaysIncludePattern: true,
      layout: {
        type: 'pattern',
        pattern: '{"date":"%d","level":"%p","category":"%c","host":"%h","pid":"%z","data":\'%m\'}',
      },
      // 日志文件按日期（天）切割
      pattern: 'yyyyMMdd',
      daysToKeep: 60,
      // maxLogSize: 10485760,
      numBackups: 3,
      keepFileExt: true,
    },
    errors: {
      type: 'logLevelFilter',
      level: 'ERROR',
      appender: 'errorFile',
    },
  },
  categories: {
    default: {
      appenders: ['app', 'errors'],
      level: 'DEBUG',
    },
    info: { appenders: ['app', 'errors'], level: 'info' },
    access: { appenders: ['app', 'errors'], level: 'info' },
    http: { appenders: ['access'], level: 'DEBUG' },
  },
  pm2: true, // 使用 pm2 来管理项目时，打开
  pm2InstanceVar: 'INSTANCE_ID', // 会根据 pm2 分配的 id 进行区分，以免各进程在写日志时造成冲突
}

const getConfigure = () => {
  if (env === 'development') {
    log4jsConfigure.appenders['console'] = {
      type: 'console',
      layout: { type: 'Nest-Admin' },
    }
    log4jsConfigure.categories.default.appenders.unshift('console')
    log4jsConfigure.categories.info.appenders.unshift('console')
    log4jsConfigure.categories.access.appenders.unshift('console')
  }
  return log4jsConfigure
}

// 注入配置
Log4js.configure(getConfigure())

// 实例化
const logger = Log4js.getLogger()
logger.level = LoggerLevel.TRACE

/**
 * 日志对外门面（静态方法）
 * - 业务侧统一调用 Logger.info / Logger.error / Logger.access 等，**不需要** 自己 new
 * - 每个静态方法都会自动把调用方坐标（getStackTrace）作为第一条参数注入
 * - 等级含义：
 *     trace/debug   开发调试（生产被过滤）
 *     info          正常业务日志（HTTP 响应等）
 *     warn          4xx 客户端异常
 *     error         5xx 与未捕获异常
 *     fatal         致命错误（进程级）
 *     access        HTTP 访问日志，独立 category 走 access.log 文件
 */
export class Logger {
  /** 最细粒度跟踪日志（生产默认关闭） */
  static trace(...args) {
    logger.trace(Logger.getStackTrace(), ...args)
  }

  /** 调试日志（生产默认关闭） */
  static debug(...args) {
    logger.debug(Logger.getStackTrace(), ...args)
  }

  /** 通用日志（与 info 等价，保留兼容旧调用） */
  static log(...args) {
    logger.info(Logger.getStackTrace(), ...args)
  }

  /** 普通业务日志（如 HTTP 200 响应、TransformInterceptor 包装输出） */
  static info(...args) {
    logger.info(Logger.getStackTrace(), ...args)
  }

  /** 警告日志（如 HTTP 4xx） */
  static warn(...args) {
    logger.warn(Logger.getStackTrace(), ...args)
  }

  /** warning 别名（兼容旧调用） */
  static warning(...args) {
    logger.warn(Logger.getStackTrace(), ...args)
  }

  /** 错误日志（如 HTTP 5xx、未捕获异常） */
  static error(...args) {
    logger.error(Logger.getStackTrace(), ...args)
  }

  /** 致命错误（进程级） */
  static fatal(...args) {
    logger.fatal(Logger.getStackTrace(), ...args)
  }

  /** 访问日志（独立走 http category，写入 access.log） */
  static access(...args) {
    const loggerCustom = Log4js.getLogger('http')
    loggerCustom.info(Logger.getStackTrace(), ...args)
  }

  /**
   * 获取调用方栈坐标（basename + 行:列）
   * - deep 默认 2：跳过本函数 + 上层 Logger.xxx 包装
   * @param deep 栈深度（默认 2，跳过自身 + 包装层）
   * @returns "filename(line: L, column: C):" 形式字符串
   */
  static getStackTrace(deep = 2): string {
    const stackList: StackTrace.StackFrame[] = StackTrace.getSync()
    const stackInfo: StackTrace.StackFrame = stackList[deep]

    const lineNumber: number = stackInfo.lineNumber
    const columnNumber: number = stackInfo.columnNumber
    const fileName: string = stackInfo.fileName
    const basename: string = Path.basename(fileName)
    return `${basename}(line: ${lineNumber}, column: ${columnNumber}): \n`
  }
}
