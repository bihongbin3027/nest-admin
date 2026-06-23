import { ApiProperty } from '@nestjs/swagger'
import { $enum } from 'ts-enum-util'

import { StatusValue } from '../../../common/enums/common.enum'
import { ReqListQuery } from '../../../common/utils/req-list-query'

/**
 * 用户列表查询 DTO
 * - 继承 ReqListQuery，自带 page / size
 * - account / status 走 sys_user 表
 * - roleId / hasCurrRole 委派给 UserRoleService.findUserByRoleId
 * - deptId / hasCurrDept 已定义但目前 UserService.findList 未消费，留作扩展
 */
export class FindUserListDto extends ReqListQuery {
  /** 登录账号模糊搜索 */
  @ApiProperty({ description: '账号模糊搜索', required: false })
  account?: string

  /** 按账号状态过滤（1-有效，0-禁用） */
  @ApiProperty({ description: '按账号状态查询用户', enum: $enum(StatusValue).getValues(), required: false })
  status?: StatusValue

  /** 关联角色 id（设置后走 UserRoleService 分支） */
  @ApiProperty({ description: '拥有角色id', required: false })
  roleId?: string

  /** 当 roleId 不为空时有效，0-无当前角色，1-有当前角色 */
  @ApiProperty({
    description: '当 roleId 不为空时有效，查询用户是否有当前权限 0-无当前角色 1-有当前角色',
    enum: [0, 1],
    required: false,
  })
  hasCurrRole?: 0 | 1

  /** 部门 id（保留扩展，目前 Service 未消费） */
  @ApiProperty({ description: '部门id', required: false })
  deptId?: string

  /** 当 deptId 不为空时有效，0-不在当前部门，1-在当前部门 */
  @ApiProperty({
    description: '当 deptId 不为空时有效，查询用户是否在当前部门 0-不在当前部门 1-在当前部门',
    enum: [0, 1],
    required: false,
  })
  hasCurrDept?: 0 | 1
}
