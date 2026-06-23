import { Inject, Injectable } from '@nestjs/common'

import { UserEntity } from '../user/user.entity'
import { UserService } from '../user/user.service'

/**
 * 鉴权 Service
 * - 为 AuthStrategy.validate 提供业务支撑：解析 JWT payload 后回查用户实体
 * - 命中即认为 token 有效，把 user 挂到 req.user；未命中则 Strategy 抛 UnauthorizedException
 * - 通过 @Inject(UserService) + forwardRef 避免与 UserModule 循环依赖报错
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(UserService)
    private readonly userService: UserService,
  ) {}

  /**
   * 根据 JWT payload 中的用户 id 校验并返回用户实体
   * @param payload JWT 解析后的负载，结构为 { id: string }
   * @returns UserEntity 当前登录用户（带 password/salt 已置空）
   */
  async validateUser(payload: { id: string }): Promise<UserEntity> {
    // findOneById 内部走 Redis 哈希缓存，未命中再回源数据库；返回前已清空 password/salt 字段
    return await this.userService.findOneById(payload.id)
  }
}
