import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { plainToInstance, instanceToPlain } from 'class-transformer'
import { Between, EntityManager, Repository } from 'typeorm'
import * as fs from 'fs'
import * as uuid from 'uuid'
import path from 'path'
import mime from 'mime-types'

import { ResultData } from '../../common/utils/result'
import { AppHttpCode } from '../../common/enums/code.enum'

import { OssEntity } from './oss.entity'
import { FindOssDto } from './dto/find-oss.dto'

/**
 * 对象存储 Service
 * - 落盘到 yml 中 app.file.location 配置的目录
 * - 文件名重写为 uuid + 扩展名（基于 mimetype 而非 originalname，避免被伪造）
 * - 构造对外可访问 URL（app.file.domain + app.file.serveRoot + 文件名）
 * - 落盘后事务内写入 sys_oss 表
 * - 启动时检测 basePath 是否有写权限，无权限直接抛错（fail-fast）
 * - 注：本 Service 只在 sys_oss 写入基础字段（url / size / type / location / business / userId / userAccount）
 *      RAG 轨道相关字段（ragTrack / vectorStatus / isDir / parentId / associatedTable / fileName）
 *      由 RAG 模块独立维护，本 Service 不消费也不写入
 * - 注：当前未提供删除文件端点（Controller 只有 upload / list 两个接口）
 */
@Injectable()
export class OssService {
  // 当前项目根目录（如 **/**/dist），用于拼接相对路径形式的 file.location
  private readonly productLocation = process.cwd()
  // 文件上传存储路径（构造时归一化）
  private basePath = ''

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(OssEntity)
    private readonly ossRepo: Repository<OssEntity>,
    @InjectEntityManager()
    private readonly ossManager: EntityManager,
  ) {
    // 解析 yml 中配置的存储路径（相对路径以 productLocation 为基准）
    const configLocation = this.config.get<string>('app.file.location') || '../upload'
    this.basePath = path.normalize(
      path.isAbsolute(configLocation) ? `${configLocation}` : path.join(this.productLocation, `${configLocation}`),
    )
    // 检测文件存储路径是否可写（fail-fast：服务起来时就暴露问题，不要等到第一次上传才发现）
    try {
      fs.accessSync(this.basePath, fs.constants.W_OK)
    } catch (error) {
      throw new Error(
        `文件存储路径配置 app.file.location = ${configLocation} (完整路径： ${this.basePath} ) 无写入权限`,
      )
    }
  }

  /**
   * 保存上传的文件：重命名 + 落盘 + 写库
   * @param files multer 解析后的文件列表（Controller 当前只传一个，但 Service 支持多文件批量）
   * @param business 业务描述（纯字符串或 JSON 字符串）
   * @param user 上传者（id + account）
   */
  async create(
    files: Express.Multer.File[],
    business: string,
    user: { id: string; account: string },
  ): Promise<ResultData> {
    const ossList = files.map((file) => {
      // 重新命名文件：uuid + 扩展名（按 mimetype 推断扩展名，originalname 不可靠可被伪造）
      const newFileName = `${uuid.v4().replace(/-/g, '')}.${mime.extension(file.mimetype)}`
      // 文件本地落盘绝对路径
      const fileLocation = path.normalize(path.join(this.basePath, newFileName))
      // 创建文件写入流并写入 buffer
      const writeFile = fs.createWriteStream(fileLocation)
      writeFile.write(file.buffer)
      // 必须关闭流（否则句柄泄漏、文件锁不释放）
      writeFile.close()
      // 组装待写入的 OssEntity
      const ossFile = {
        url: `${this.config.get<string>('app.file.domain')}${
          this.config.get<string>('app.file.serveRoot') || ''
        }/${newFileName}`,
        size: file.size,
        type: file.mimetype,
        location: fileLocation,
        business: business || '',
        userId: user.id,
        userAccount: user.account,
      }
      return plainToInstance(OssEntity, ossFile)
    })
    // 事务内批量写入
    const result = await this.ossManager.transaction(async (transactionalEntityManager) => {
      return await transactionalEntityManager.save<OssEntity>(ossList)
    })
    if (!result) {
      return ResultData.fail(AppHttpCode.SERVICE_ERROR, '文件存储失败，请稍后重新上传')
    }
    return ResultData.ok(instanceToPlain(result))
  }

  /**
   * 查询文件上传列表（分页 + 时间区间）
   * @param search FindOssDto 含 page / size / startDay / endDay
   */
  async findList(search: FindOssDto): Promise<ResultData> {
    const { size, page, startDay, endDay } = search
    // 时间区间：startDay/endDay 都不为空时按 Between 过滤；否则返回全部
    const where = startDay && endDay ? { createDate: Between(`${startDay} 00:00:00`, `${endDay} 23:59:59`) } : {}
    const res = await this.ossRepo.findAndCount({ order: { id: 'DESC' }, skip: size * (page - 1), take: size, where })
    return ResultData.ok({ list: instanceToPlain(res[0]), total: res[1] })
  }
}
