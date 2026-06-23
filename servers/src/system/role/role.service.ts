import { Injectable } from '@nestjs/common'
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm'
import { Repository, EntityManager, DataSource } from 'typeorm'
import { plainToInstance } from 'class-transformer'

import { AppHttpCode } from '../../common/enums/code.enum'
import { UserType } from '../../common/enums/common.enum'
import { ResultData } from '../../common/utils/result'

import { UserRoleEntity } from '../user/role/user-role.entity'

import { RoleEntity } from './role.entity'
import { RoleMenuEntity } from './role-menu.entity'
import { CreateRoleDto } from './dto/create-role.dto'
import { UpdateRoleDto } from './dto/update-role.dto'
import { UserEntity } from '../user/user.entity'
import { PermService } from '../perm/perm.service'

/**
 * 角色管理 Service
 * - 负责角色 CRUD、角色-菜单绑定、角色-用户绑定
 * - 角色变更后调用 PermService.clearUserInfoCache 失效用户维度缓存（接口权限 + 菜单）
 */
@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(RoleMenuEntity)
    private readonly roleMenuRepo: Repository<RoleMenuEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectEntityManager()
    private readonly roleManager: EntityManager,
    private readonly dataSource: DataSource,
    private readonly permService: PermService,
  ) {}

  /**
   * 创建角色并在同一事务内绑定菜单；若创建者是普通用户则自动关联到自己
   * @param dto 创建参数（含 name/remark/menuIds）
   * @param user 当前登录用户，用于判断是否需要把新角色自动绑到创建者
   */
  async create(dto: CreateRoleDto, user: UserEntity): Promise<ResultData> {
    const role = plainToInstance(RoleEntity, dto)
    // 同一事务内：保存角色 → 保存角色-菜单 → (普通用户时)保存用户-角色
    const res = await this.roleManager.transaction(async (transactionalEntityManager) => {
      const result = await transactionalEntityManager.save<RoleEntity>(plainToInstance(RoleEntity, role))
      if (result) {
        const roleMenus = plainToInstance(
          RoleMenuEntity,
          dto.menuIds.map((menuId) => {
            return { menuId, roleId: result.id }
          }),
        )
        await transactionalEntityManager.save<RoleMenuEntity>(roleMenus)
        if (user.type === UserType.ORDINARY_USER) {
          // 普通用户创建的角色默认绑给自己；超管用户可以查看全部角色，无需自绑
          const userRole = { userId: user.id, roleId: result.id }
          await transactionalEntityManager.save<UserRoleEntity>(plainToInstance(UserRoleEntity, userRole))
        }
      }
      return result
    })
    if (!res) return ResultData.fail(AppHttpCode.SERVICE_ERROR, '角色创建失败，请稍后重试')
    return ResultData.ok(res)
  }

  /**
   * 更新角色基本信息与菜单绑定；操作完成后清理用户缓存
   * @param dto 更新参数（name/remark/menuIds 均为可选）
   */
  async update(dto: UpdateRoleDto): Promise<ResultData> {
    const existing = await this.roleRepo.findOne({ where: { id: dto.id } })
    if (!existing) return ResultData.fail(AppHttpCode.ROLE_NOT_FOUND, '当前角色不存在或已被删除')
    const { affected } = await this.roleManager.transaction(async (transactionalEntityManager) => {
      // menuIds 是"全量替换"语义：先删后插，保证最终态与 dto 一致
      if (dto.menuIds) {
        await transactionalEntityManager.delete(RoleMenuEntity, { roleId: dto.id })
        await transactionalEntityManager.save(
          RoleMenuEntity,
          plainToInstance(
            RoleMenuEntity,
            dto.menuIds?.map((menuId) => {
              return { menuId, roleId: dto.id }
            }),
          ),
        )
      }
      // 字段级增量更新：只把 dto 中显式传入的字段写库（其余保留旧值）
      const updateRole = {
        id: dto.id,
        ...(dto.name ? { name: dto.name } : null),
        ...(dto.remark ? { remark: dto.remark } : null),
      }
      const result = await transactionalEntityManager.update<RoleEntity>(
        RoleEntity,
        dto.id,
        plainToInstance(RoleEntity, updateRole),
      )
      return result
    })
    if (!affected) return ResultData.fail(AppHttpCode.SERVICE_ERROR, '当前角色更新失败，请稍后尝试')
    // 角色名/备注变更不影响接口权限，菜单变更才影响；这里为保险起见一并清空用户菜单与权限缓存
    // 注意：传 SCAN 的 glob 模式，不是正则。'nest:user:menu*' / 'nest:user:perm*' 才能精确匹配到对应 key
    await this.permService.clearUserInfoCache('nest:user:menu*')
    await this.permService.clearUserInfoCache('nest:user:perm*')
    return ResultData.ok()
  }

  /**
   * 删除角色（要求已解除所有用户绑定），删除后清空用户维度全部缓存
   * @param id 角色 id
   */
  async delete(id: string): Promise<ResultData> {
    const existing = await this.roleRepo.findOne({ where: { id } })
    if (!existing) return ResultData.fail(AppHttpCode.ROLE_NOT_FOUND, '当前角色不存在或已被删除')
    // 业务规则：仍有用户绑定时不允许删除，避免误删导致用户权限全空
    const existingBindUser = await this.userRoleRepo.findOne({ where: { roleId: id } })
    if (existingBindUser) return ResultData.fail(AppHttpCode.ROLE_NOT_DEL, '当前角色还有绑定的用户，需要解除关联后删除')
    const { affected } = await this.roleManager.transaction(async (transactionalEntityManager) => {
      // 删除 role - menu 关系
      await transactionalEntityManager.delete(RoleMenuEntity, { roleId: id })
      // 删除 user - role 关系
      // await transactionalEntityManager.delete(UserRoleEntity, { roleId: id })
      const result = await transactionalEntityManager.delete<RoleEntity>(RoleEntity, id)
      return result
    })
    if (!affected) return ResultData.fail(AppHttpCode.SERVICE_ERROR, '删除失败，请稍后重试')
    // 角色删除后所有用户的菜单与接口权限都会变化，直接清空 nest:user:* 全量缓存最稳妥
    await this.permService.clearUserInfoCache()
    return ResultData.ok()
  }

  /**
   * 查询单个角色的菜单 id 列表（编辑角色时回显已授权菜单）
   * @param id 角色 id
   */
  async findOnePerm(id: string): Promise<ResultData> {
    const roleMenu = await this.roleMenuRepo.find({ select: ['menuId'], where: { roleId: id } })
    return ResultData.ok(roleMenu.map((v) => v.menuId))
  }

  /**
   * 角色列表查询，超管返回全部；普通用户仅返回自己已绑定的角色
   * @param type 当前用户类型
   * @param userId 当前用户 id（普通用户分支用于过滤）
   */
  async findList(type: UserType, userId: string): Promise<ResultData> {
    let roleData = []
    if (type === UserType.SUPER_ADMIN) {
      // 超管无需过滤，返回 sys_role 全表
      roleData = await this.roleRepo.find({ order: { id: 'DESC' } })
    } else {
      // 普通用户通过 sys_user_role 关联过滤，确保只看到自己能用到的角色
      roleData = await this.dataSource
        .createQueryBuilder('sys_role', 'sr')
        .leftJoinAndSelect('sys_user_role', 'sur', 'sr.id = sur.role_id')
        .where('sur.user_id = :userId', { userId })
        .getMany()
    }
    return ResultData.ok(roleData)
  }
}
