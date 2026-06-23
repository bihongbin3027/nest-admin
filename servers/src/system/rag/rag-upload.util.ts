/**
 * 【共享】RAG 上传根目录常量
 *
 * - 原本定义在 rag.controller.ts 的模块顶层（因为 @UseInterceptors 装饰器在构造函数前求值）
 * - 但 service 也要从物理文件反查行号（getStructuredRows），所以提到独立工具模块两边共享
 *
 * 实现：和 controller 的 resolveUploadRoot() 保持一致——读 yml 拿 app.file.location，
 * 失败回退 '../upload'。注意：必须用 try/catch 兜底（启动早期 ConfigService 还没就绪）。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

/**
 * 从 yml 配置中解析 RAG 模块的上传根目录（app.file.location）
 * - 启动早期 ConfigService 尚未就绪，需独立读文件，失败回退 '../upload'
 * @returns 物理磁盘绝对路径（normalize 后）
 */
function resolveUploadRoot(): string {
  try {
    const env = process.env.NODE_ENV || 'development'
    const cfgPath = path.join(process.cwd(), 'src', 'config', `${env}.yml`)
    if (fs.existsSync(cfgPath)) {
      const doc: any = yaml.load(fs.readFileSync(cfgPath, 'utf8'))
      const loc = doc?.app?.file?.location || '../upload'
      return path.isAbsolute(loc) ? loc : path.normalize(path.join(process.cwd(), loc))
    }
  } catch {
    /* fallthrough */
  }
  return path.normalize(path.join(process.cwd(), '../upload'))
}

/**
 * RAG 模块的上传目录绝对路径（= resolveUploadRoot() + '/rag'）
 * - controller 的 multer diskStorage 与 service 的物理文件反查都依赖此常量
 */
export const RAG_UPLOAD_DIR = path.join(resolveUploadRoot(), 'rag')

// 启动时确保目录存在（与 controller 保持一致）
try {
  fs.mkdirSync(RAG_UPLOAD_DIR, { recursive: true })
} catch {
  /* ignore */
}
