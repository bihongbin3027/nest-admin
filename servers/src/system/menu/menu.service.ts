import { Injectable } from '@nestjs/common'
import { Repository, In, EntityManager } from 'typeorm'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { plainToInstance } from 'class-transformer'

import { ResultData } from '../../common/utils/result'
import { AppHttpCode } from '../../common/enums/code.enum'

import { PermService } from '../perm/perm.service'

import { MenuEntity } from './menu.entity'
import { MenuPermEntity } from './menu-perm.entity'
import { CreateMenuDto } from './dto/create-menu.dto'

import { UpdateMenuDto } from './dto/update-menu.dto'

/**
 * 菜单管理 Service
 * - 维护 sys_menu 与 sys_menu_perm 的写操作
 * - 写操作完成后调用 PermService.clearUserInfoCache 让所有用户的菜单与接口权限缓存失效
 */
@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuEntity)
    private readonly menuRepo: Repository<MenuEntity>,
    @InjectRepository(MenuPermEntity)
    private readonly menuPermRepo: Repository<MenuPermEntity>,
    @InjectEntityManager()
    private readonly menuManager: EntityManager,
    private readonly permService: PermService,
  ) {}

  /**
   * 创建菜单并批量绑定接口权限，事务内一次性写入
   * @param dto 创建参数（parentId/name/code/type/orderNum/menuPermList）
   */
  async create(dto: CreateMenuDto): Promise<ResultData> {
    // parentId='0' 表示根菜单，不需要校验父级存在
    if (dto.parentId !== '0') {
      // 查询当前父级菜单是否存在
      const parentMenu = await this.menuRepo.findOne({ where: { id: dto.parentId } })
      if (!parentMenu) return ResultData.fail(AppHttpCode.MENU_NOT_FOUND, '当前父级菜单不存在，请调整后重新添加')
    }
    const menu = await this.menuManager.transaction(async (transactionalEntityManager) => {
      const menuResult = await transactionalEntityManager.save<MenuEntity>(plainToInstance(MenuEntity, dto))
      // 把 dto.menuPermList 转换为 MenuPermEntity 列表，写入 sys_menu_perm
      await transactionalEntityManager.save<MenuPermEntity>(
        plainToInstance(
          MenuPermEntity,
          dto.menuPermList.map((perm) => {
            return { menuId: menuResult.id, ...perm }
          }),
        ),
      )
      return menuResult
    })
    if (!menu) return ResultData.fail(AppHttpCode.SERVICE_ERROR, '菜单创建失败，请稍后重试')
    return ResultData.ok()
  }

  /**
   * 获取全部菜单（默认排除按钮）
   * @param hasBtn true-包含按钮(type=3)；false-仅菜单/目录(type=1/2)
   */
  async findAllMenu(hasBtn: boolean): Promise<ResultData> {
    const where = { ...(!hasBtn ? { type: In([1, 2]) } : null) }
    const menuList = await this.menuRepo.find({ where, order: { orderNum: 'DESC', id: 'ASC' } })
    return ResultData.ok(menuList)
  }

  /**
   * 获取指定父菜单下的全部按钮（type=3），用于角色编辑页按钮勾选
   * @param parentId 父菜单 id
   */
  async findBtnByParentId(parentId: string): Promise<ResultData> {
    const btnList = await this.menuRepo.find({ where: { parentId }, order: { orderNum: 'DESC', id: 'DESC' } })
    return ResultData.ok(btnList)
  }

  /**
   * 获取单个菜单的接口权限列表
   * @param menuId 菜单 id
   */
  async findMenuPerms(menuId: string): Promise<ResultData> {
    const menuPerms = await this.menuPermRepo.find({ where: { menuId } })
    return ResultData.ok(menuPerms)
  }

  /**
   * 删除菜单（连同其接口权限绑定），操作完成后清空用户缓存
   * @param id 菜单 id
   */
  async deleteMenu(id: string): Promise<ResultData> {
    const existing = await this.menuRepo.findOne({ where: { id } })
    if (!existing) return ResultData.fail(AppHttpCode.MENU_NOT_FOUND, '当前菜单不存在或已删除')
    const { affected } = await this.menuManager.transaction(async (transactionalEntityManager) => {
      // 先删 sys_menu_perm 关联，再删 sys_menu 主记录
      await transactionalEntityManager.delete(MenuPermEntity, { menuId: id })
      const result = await transactionalEntityManager.delete<MenuEntity>(MenuEntity, id)
      return result
    })
    if (!affected) return ResultData.fail(AppHttpCode.SERVICE_ERROR, '菜单删除失败，请稍后重试')
    // 菜单删除会改变所有用户的菜单与接口权限，必须清空 nest:user:* 缓存
    await this.permService.clearUserInfoCache()
    return ResultData.ok()
  }

  /**
   * 更新菜单基本信息与接口权限（接口权限为"全量替换"），操作完成后清空用户缓存
   * @param dto 更新参数
   */
  async updateMenu(dto: UpdateMenuDto): Promise<ResultData> {
    const existing = await this.menuRepo.findOne({ where: { id: dto.id } })
    if (!existing) return ResultData.fail(AppHttpCode.MENU_NOT_FOUND, '当前菜单不存在或已删除')
    const { affected } = await this.menuManager.transaction(async (transactionalEntityManager) => {
      // 删除原有接口权限权限
      await this.menuPermRepo.delete({ menuId: dto.id })
      // 新的接口权限入库（菜单-接口权限是全量替换语义）
      const menuPermDto = plainToInstance(
        MenuPermEntity,
        dto.menuPermList.map((v) => ({ menuId: dto.id, ...v })),
      )
      await transactionalEntityManager.save<MenuPermEntity>(menuPermDto)
      // 菜单自身字段需要从 dto 写入，但 menuPermList 不是 MenuEntity 的字段，先剔除再转换
      delete dto.menuPermList
      // excludeExtraneousValues true  排除无关属性。 但需要在实体类中 将属性使用 @Expose()
      return await transactionalEntityManager.update<MenuEntity>(MenuEntity, dto.id, plainToInstance(MenuEntity, dto))
    })
    if (!affected) return ResultData.fail(AppHttpCode.SERVICE_ERROR, '当前菜单更新失败，请稍后重试')
    // 清除用户权限缓存：菜单接口权限变化直接影响所有用户的接口权限
    await this.permService.clearUserInfoCache()
    return ResultData.ok()
  }
}
