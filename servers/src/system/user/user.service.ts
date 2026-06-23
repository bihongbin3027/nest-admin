import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { Like, Repository, In, EntityManager } from 'typeorm'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { genSalt, hash, compare, genSaltSync, hashSync } from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'
import ExcelJS from 'exceljs'
import ms from 'ms'

import { ResultData } from '../../common/utils/result'
import { getRedisKey } from '../../common/utils/utils'
import { RedisKeyPrefix } from '../../common/enums/redis-key-prefix.enum'
import { AppHttpCode } from '../../common/enums/code.enum'
import { RedisService } from '../../common/libs/redis/redis.service'

import { validPhone, validEmail } from '../../common/utils/validate'
import { UserType } from '../../common/enums/common.enum'

import { PermService } from '../perm/perm.service'

import { UserRoleService } from './role/user-role.service'

import { UserEntity } from './user.entity'
import { UserRoleEntity } from './role/user-role.entity'

import { CreateUserDto } from './dto/create-user.dto'
import { FindUserListDto } from './dto/find-user-list.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { CreateOrUpdateUserRolesDto } from './dto/create-user-roles.dto'
import { CreateTokenDto } from './dto/create-token.dto'

/**
 * 用户管理 Service
 * - 处理用户的 CRUD、登录、密码、状态、角色绑定等核心业务
 * - 集成 Redis 缓存用户信息（哈希存储，过期时间与 token 一致）
 * - 集成 Excel 批量导入（重复检测 + 初始密码加盐入库）
 * - 集成 JWT 签发与刷新
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectEntityManager()
    private readonly userManager: EntityManager,
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly userRoleService: UserRoleService,
    private readonly permService: PermService,
  ) {}

  /**
   * 根据 id 查询单个用户（优先读 Redis 哈希缓存）
   * @param id 用户 id
   * @returns 不含 password / salt 字段的 UserEntity
   */
  async findOneById(id: string): Promise<UserEntity> {
    const redisKey = getRedisKey(RedisKeyPrefix.USER_INFO, id)
    // 优先读取 Redis 哈希缓存
    const result = await this.redisService.hGetAll(redisKey)
    // plainToInstance 去除 password salt
    let user = plainToInstance(UserEntity, result, { enableImplicitConversion: true })
    if (!user?.id) {
      // 缓存未命中则查 DB，并回写 Redis（TTL 与 token 过期时间一致）
      user = await this.userRepo.findOne({ where: { id } })
      user = plainToInstance(UserEntity, { ...user }, { enableImplicitConversion: true })
      await this.redisService.hmset(
        redisKey,
        instanceToPlain(user),
        ms(this.config.get<string>('jwt.expiresin')) / 1000,
      )
    }
    // 强制清空敏感字段（即使缓存存在也再清一遍，防御性编程）
    user.password = ''
    user.salt = ''
    return user
  }

  /**
   * 根据登录账号精确查询用户（仅查 DB，不走缓存）
   * @param account 用户登录账号
   */
  async findOneByAccount(account: string): Promise<UserEntity> {
    return await this.userRepo.findOne({ where: { account } })
  }

  /** 创建用户 */
  async create(dto: CreateUserDto): Promise<ResultData> {
    if (dto.password !== dto.confirmPassword)
      return ResultData.fail(AppHttpCode.USER_PASSWORD_INVALID, '两次输入密码不一致，请重试')
    // 防止重复创建 start
    if (await this.findOneByAccount(dto.account))
      return ResultData.fail(AppHttpCode.USER_CREATE_EXISTING, '帐号已存在，请调整后重新注册！')
    if (await this.userRepo.findOne({ where: { phoneNum: dto.phoneNum } }))
      return ResultData.fail(AppHttpCode.USER_CREATE_EXISTING, '当前手机号已存在，请调整后重新注册')
    if (await this.userRepo.findOne({ where: { email: dto.email } }))
      return ResultData.fail(AppHttpCode.USER_CREATE_EXISTING, '当前邮箱已存在，请调整后重新注册')
    // 防止重复创建 end
    const salt = await genSalt()
    dto.password = await hash(dto.password, salt)
    // plainToInstance  忽略转换 @Exclude 装饰器
    const user = plainToInstance(UserEntity, { salt, ...dto }, { ignoreDecorators: true })
    const result = await this.userManager.transaction(async (transactionalEntityManager) => {
      return await transactionalEntityManager.save<UserEntity>(user)
    })
    return ResultData.ok(instanceToPlain(result))
  }

  /**
   * 登录
   * account 有可能是 帐号/手机/邮箱
   */
  async login(account: string, password: string): Promise<ResultData> {
    let user = null
    if (validPhone(account)) {
      // 手机登录
      user = await this.userRepo.findOne({ where: { phoneNum: account } })
    } else if (validEmail(account)) {
      // 邮箱登录
      user = await this.userRepo.findOne({ where: { email: account } })
    } else {
      // 帐号登录
      user = await this.findOneByAccount(account)
    }
    if (!user) return ResultData.fail(AppHttpCode.USER_PASSWORD_INVALID, '帐号或密码错误')
    // bcrypt 校验密码
    const checkPassword = await compare(password, user.password)
    if (!checkPassword) return ResultData.fail(AppHttpCode.USER_PASSWORD_INVALID, '帐号或密码错误')
    if (user.status === 0)
      return ResultData.fail(AppHttpCode.USER_ACCOUNT_FORBIDDEN, '您已被禁用，如需正常使用请联系管理员')
    // 生成 token
    const data = this.genToken({ id: user.id })
    return ResultData.ok(data)
  }

  /**
   * 刷新 token（基于已登录用户 id 重新签发 access/refresh token）
   * @param userId 当前登录用户 id
   */
  async updateToken(userId: string): Promise<ResultData> {
    const data = this.genToken({ id: userId })
    return ResultData.ok(data)
  }

  /**
   * 批量导入用户
   * 流程：
   *  1. 校验文件类型与大小（xls/xlsx，5M 以内）
   *  2. parseExcel 解析首个 sheet
   *  3. excel 内部去重检测（account / phone / email）
   *  4. 与数据库已有数据再次去重
   *  5. 用 user.initialPassword 加盐后批量入库
   * @param file 上传的 excel 文件
   */
  async importUsers(file: Express.Multer.File): Promise<ResultData> {
    const acceptFileType = 'application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    if (!acceptFileType.indexOf(file.mimetype))
      return ResultData.fail(AppHttpCode.FILE_TYPE_ERROR, '文件类型错误，请上传 .xls 或 .xlsx 文件')
    if (file.size > 5 * 1024 * 1024)
      return ResultData.fail(AppHttpCode.FILE_SIZE_EXCEED_LIMIT, '文件大小超过，最大支持 5M')
    const data = await this.parseExcel(file.buffer)
    // 需要处理 excel 内帐号 手机号 邮箱 是否有重复的情况
    if (data.length === 0) return ResultData.fail(AppHttpCode.DATA_IS_EMPTY, 'excel 导入数据为空')
    // 第一阶段：扫描整张表，构造临时索引用于内部去重检测
    const userArr = []
    const accountMap = new Map()
    const phoneMap = new Map()
    const emailMap = new Map()
    // 从 0 开始（data 已去掉表头）
    for (let i = 0, len = data.length; i < len; i++) {
      const dataArr = data[i] as Array<any>
      if (dataArr.length === 0) break
      const [account, phone, email, avatar] = dataArr
      userArr.push({ account, phoneNum: phone, email, avatar })
      if (account && !accountMap.has(account)) {
        accountMap.set(account, [])
      } else if (account) {
        // 有重复的：记录冲突行号（1-based）
        accountMap.get(account).push(i + 1)
      } else {
        return ResultData.fail(AppHttpCode.DATA_IS_EMPTY, '上传文件帐号有空数据，请检查后再导入')
      }
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, [])
      } else if (phone) {
        phoneMap.get(phone).push(i + 1)
      }
      if (email && !emailMap.has(email)) {
        emailMap.set(email, [])
      } else if (email) {
        emailMap.get(email).push(i + 1)
      }
    }
    // 收集所有内部冲突
    const accountErrArr = []
    for (const [key, val] of accountMap) {
      if (val.length > 0) {
        accountErrArr.push({ key, val })
      }
    }
    const phoneErrArr = []
    for (const [key, val] of phoneMap) {
      if (val.length > 0) {
        phoneErrArr.push({ key, val })
      }
    }
    const emailErrArr = []
    for (const [key, val] of emailMap) {
      if (val.length > 0) {
        emailErrArr.push({ key, val })
      }
    }
    if (accountErrArr.length > 0 || phoneErrArr.length > 0 || emailErrArr.length > 0) {
      return ResultData.fail(AppHttpCode.PARAM_INVALID, '导入 excel 内部有数据重复或数据有误，请修改调整后上传导入', {
        account: accountErrArr,
        phone: phoneErrArr,
        email: emailErrArr,
      })
    }
    // 第二阶段：与数据库已有数据再查一次
    // 若 excel 内部无重复，则需要判断 excel 中数据 是否与 数据库的数据重复
    const existingAccount = await this.userRepo.find({
      select: ['account'],
      where: { account: In(userArr.map((v) => v.account)) },
    })
    if (existingAccount.length > 0) {
      existingAccount.forEach((v) => {
        // userArr 中的数据 下标 换算成 excel 中的 行号 + 2（+1 表头行 +1 转 1-based）
        accountErrArr.push({ key: v.account, val: [userArr.findIndex((m) => m.account === v.account) + 2] })
      })
    }
    // 手机号、邮箱非必填，所以查询存在重复的 过滤掉 空数据
    const existingPhone = await this.userRepo.find({
      select: ['phoneNum'],
      where: { account: In(userArr.map((v) => v.phoneNum).filter((v) => !!v)) },
    })
    if (existingPhone.length > 0) {
      existingPhone.forEach((v) => {
        // userArr 中的数据 下标 换算成 excel 中的 行号 + 2
        phoneErrArr.push({ key: v.phoneNum, val: [userArr.findIndex((m) => m.phoneNum === v.phoneNum) + 2] })
      })
    }
    const existingEmail = await this.userRepo.find({
      select: ['email'],
      where: { account: In(userArr.map((v) => v.email).filter((v) => !!v)) },
    })
    if (existingEmail.length > 0) {
      existingEmail.forEach((v) => {
        // userArr 中的数据 下标 换算成 excel 中的 行号 + 2
        emailErrArr.push({ key: v.email, val: [userArr.findIndex((m) => m.email === v.email) + 2] })
      })
    }
    if (accountErrArr.length > 0 || phoneErrArr.length > 0 || emailErrArr.length > 0) {
      return ResultData.fail(AppHttpCode.PARAM_INVALID, '导入 excel 系统中已有重复项，请修改调整后上传导入', {
        account: accountErrArr,
        phone: phoneErrArr,
        email: emailErrArr,
      })
    }
    // 第三阶段：excel 与数据库无重复，准备入库
    // 使用 yml 中配置的 user.initialPassword 统一加盐入库
    const password = this.config.get<string>('user.initialPassword')
    userArr.forEach((v) => {
      const salt = genSaltSync()
      const encryptPw = hashSync(password, salt)
      v['password'] = encryptPw
      v['salt'] = salt
    })
    const result = await this.userManager.transaction(async (transactionalEntityManager) => {
      return await transactionalEntityManager.save<UserEntity>(
        plainToInstance(UserEntity, userArr, { ignoreDecorators: true }),
      )
    })
    return ResultData.ok(instanceToPlain(result))
  }

  /**
   * 解析 excel 第一个工作表，返回与原 node-xlsx workSheet[0].data 等价的二维数组（已跳过表头）
   * 兼容富文本 { richText: [...] } 与超链接 { hyperlink, text } 单元格
   * @param buffer excel 文件 Buffer
   */
  private async parseExcel(buffer: Buffer): Promise<any[][]> {
    const workbook = new ExcelJS.Workbook()
    // Node 20 Buffer 是 Buffer<ArrayBufferLike> 泛型,exceljs 类型签名较老,用 ArrayBuffer 兼容
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const worksheet = workbook.worksheets[0]
    if (!worksheet) return []
    const data: any[][] = []
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // 跳过表头
      if (rowNumber === 1) return
      const rowData: any[] = []
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // cell.value 可能是富文本对象 { richText: [...] }、超链接 { hyperlink, text } 或直接值
        const v = cell.value
        rowData[colNumber - 1] = v && typeof v === 'object' && 'text' in v ? (v as any).text : v
      })
      data.push(rowData)
    })
    return data
  }

  /** 更新用户信息 */
  async update(dto: UpdateUserDto, currUser: UserEntity): Promise<ResultData> {
    const existing = await this.findOneById(dto.id)
    if (!existing) return ResultData.fail(AppHttpCode.USER_NOT_FOUND, '当前用户不存在或已删除')
    if (existing.status === 0)
      return ResultData.fail(AppHttpCode.USER_ACCOUNT_FORBIDDEN, '当前用户已被禁用，不可更新用户信息')
    // 权限校验：普通用户不能修改超管
    if (existing.type === UserType.SUPER_ADMIN && currUser.type === UserType.ORDINARY_USER) {
      return ResultData.fail(AppHttpCode.USER_FORBIDDEN_UPDATE, '您不可修改超管信息喔')
    }
    const roleIds = dto.roleIds || []
    // 把 roleIds 摘出来，单独走 user-role 表，不参与 user 表 update
    const userInfo = instanceToPlain(dto)
    delete userInfo.roleIds
    const { affected } = await this.userManager.transaction(async (transactionalEntityManager) => {
      if (roleIds.length > 0) {
        // 角色绑定在事务内同步完成
        await this.createOrUpdateUserRole({ userId: dto.id, roleIds })
      }
      return await transactionalEntityManager.update<UserEntity>(UserEntity, dto.id, userInfo)
    })
    if (!affected) ResultData.fail(AppHttpCode.SERVICE_ERROR, '更新失败，请稍后重试')

    // 失效 Redis 用户信息缓存，下次读取会回源 DB
    await this.redisService.del(getRedisKey(RedisKeyPrefix.USER_INFO, dto.id))
    return ResultData.ok()
  }

  /**
   * 启用 / 禁用 用户
   * @param userId 目标用户 id
   * @param status 1-启用，0-禁用
   * @param currUserId 当前登录用户 id（不可对自己操作）
   */
  async updateStatus(userId: string, status: 0 | 1, currUserId: string): Promise<ResultData> {
    if (userId === currUserId) return ResultData.fail(AppHttpCode.USER_FORBIDDEN_UPDATE, '当前登录用户状态不可更改')
    const existing = await this.findOneById(userId)
    if (!existing) ResultData.fail(AppHttpCode.USER_NOT_FOUND, '当前用户不存在或已删除')
    if (existing.type === UserType.SUPER_ADMIN)
      return ResultData.fail(AppHttpCode.USER_FORBIDDEN_UPDATE, '您不可修改超管信息喔')
    const { affected } = await this.userManager.transaction(async (transactionalEntityManager) => {
      return await transactionalEntityManager.update<UserEntity>(UserEntity, userId, { id: userId, status })
    })
    if (!affected) ResultData.fail(AppHttpCode.SERVICE_ERROR, '更新失败，请稍后尝试')
    // Redis 同步更新 status 字段，避免下次读缓存拿到旧值
    await this.redisService.hmset(getRedisKey(RedisKeyPrefix.USER_INFO, userId), { status })
    return ResultData.ok()
  }

  /**
   * 更新或重置用户密码
   * @param userId 目标用户 id
   * @param password 新密码（reset=false 时使用）
   * @param reset 是否重置，true 时使用 yml 配置的 user.initialPassword
   * @param currUser 当前操作者（普通用户不可改超管）
   */
  async updatePassword(userId: string, password: string, reset: boolean, currUser: UserEntity): Promise<ResultData> {
    const existing = await this.userRepo.findOne({ where: { id: userId } })
    if (!existing)
      return ResultData.fail(AppHttpCode.USER_NOT_FOUND, `用户不存在或已删除，${reset ? '重置' : '更新'}失败`)
    if (existing.status === 0)
      return ResultData.fail(AppHttpCode.USER_ACCOUNT_FORBIDDEN, '当前用户已被禁用，不可重置用户密码')
    if (existing.type === UserType.SUPER_ADMIN && currUser.type === UserType.ORDINARY_USER) {
      return ResultData.fail(AppHttpCode.USER_FORBIDDEN_UPDATE, '您不可修改超管信息喔')
    }
    // 沿用旧 salt（保证同一用户多端密码哈希一致）
    const newPassword = reset ? this.config.get<string>('user.initialPassword') : password
    const user = { id: userId, password: await hash(newPassword, existing.salt) }
    const { affected } = await this.userManager.transaction(async (transactionalEntityManager) => {
      return await transactionalEntityManager.update<UserEntity>(UserEntity, userId, user)
    })
    if (!affected) ResultData.fail(AppHttpCode.SERVICE_ERROR, `${reset ? '重置' : '更新'}失败，请稍后重试`)
    return ResultData.ok()
  }

  /** 创建 or 更新用户-角色 */
  async createOrUpdateUserRole(dto: CreateOrUpdateUserRolesDto): Promise<ResultData> {
    const userRoleList = plainToInstance(
      UserRoleEntity,
      dto.roleIds.map((roleId) => {
        return { roleId, userId: dto.userId }
      }),
    )
    // 事务内：先删后写，保证用户-角色关系原子切换
    const res = await this.userManager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.delete(UserRoleEntity, { userId: dto.userId })
      const result = await transactionalEntityManager.save<UserRoleEntity>(userRoleList)
      return result
    })
    if (!res) return ResultData.fail(AppHttpCode.SERVICE_ERROR, '用户更新角色失败')
    // 回写 Redis：role 列表、失效 menu/perm 缓存（菜单和权限依赖 role，role 变了就要重算）
    await this.redisService.set(getRedisKey(RedisKeyPrefix.USER_ROLE, dto.userId), JSON.stringify(dto.roleIds))
    await this.redisService.del([
      getRedisKey(RedisKeyPrefix.USER_MENU, dto.userId),
      getRedisKey(RedisKeyPrefix.USER_PERM, dto.userId),
    ])
    return ResultData.ok()
  }

  /** 查询用户列表, 需要重新写， 包含查询 角色、部门等 */
  async findList(dto: FindUserListDto): Promise<ResultData> {
    const { page, size, account, status, roleId, hasCurrRole = 0, deptId, hasCurrDept = 0 } = dto
    if (roleId) {
      const result = await this.userRoleService.findUserByRoleId(roleId, page, size, !!Number(hasCurrRole))
      return result
    }
    const where = {
      ...(status ? { status } : null),
      ...(account ? { account: Like(`%${account}%`) } : null),
    }
    const users = await this.userRepo.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: size * (page - 1),
      take: size,
    })
    return ResultData.ok({ list: instanceToPlain(users[0]), total: users[1] })
  }

  /** 查询单个用户 */
  async findOne(id: string): Promise<ResultData> {
    const user = await this.findOneById(id)
    if (!user) return ResultData.fail(AppHttpCode.USER_NOT_FOUND, '该用户不存在或已删除')
    return ResultData.ok(instanceToPlain(user))
  }

  /**
   * 生成 token 与 刷新 token
   * @param payload 至少包含 id 字段的 JWT payload
   * @returns { accessToken, refreshToken }
   */
  genToken(payload: { id: string }): CreateTokenDto {
    const accessToken = `Bearer ${this.jwtService.sign(payload)}`
    const refreshToken = this.jwtService.sign(payload, { expiresIn: this.config.get('jwt.refreshExpiresIn') })
    return { accessToken, refreshToken }
  }

  /**
   * 生成刷新 token
   */
  refreshToken(id: string): string {
    return this.jwtService.sign({ id })
  }

  /** 校验 token */
  verifyToken(token: string): string {
    try {
      if (!token) return null
      const id = this.jwtService.verify(token.replace('Bearer ', ''))
      return id
    } catch (error) {
      return null
    }
  }
}
