import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'
import { Exclude } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 对象存储实体（sys_oss 表）
 * - 不仅记录上传文件，还兼作 RAG 知识库的文件/文件夹树元数据
 * - 关键字段：
 *    - url：对外访问路径（app.file.domain + serveRoot + uuid.ext）
 *    - location：服务器本地落盘绝对路径（@Exclude 屏蔽）
 *    - ragTrack / vectorStatus / isDir / parentId / associatedTable：RAG 双轨制所需元数据
 *    - business：上传时的业务描述（字符串或 JSON 字符串）
 */
@Entity('sys_oss')
export class OssEntity {
  /** 主键 id（bigint，自增） */
  @ApiProperty({ description: 'id' })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id: number

  /** 上传用户 id */
  @ApiProperty({ description: '上传用户id' })
  @Column({ type: 'bigint', name: 'user_id', comment: '上传用户id' })
  public userId: string

  /** 上传用户登录账号（冗余便于查询） */
  @ApiProperty({ description: '上传用户帐号' })
  @Column({ type: 'varchar', name: 'user_account', length: 32, comment: '上传用户帐号' })
  public userAccount: string

  /** 文件对外访问 URL（拼接 app.file.domain + serveRoot） */
  @ApiProperty({ description: '文件 url' })
  @Column({ type: 'varchar', comment: '文件 url' })
  public url: string

  /** 文件大小（字节） */
  @ApiProperty({ description: '文件size' })
  @Column({ type: 'int', comment: '文件size' })
  public size: number

  /** 文件 MIME 类型（如 application/pdf） */
  @ApiProperty({ description: '文件mimetype类型' })
  @Column({ type: 'varchar', comment: '文件mimetype类型' })
  public type: string

  /** 原始文件名（RAG 模块专用，存原始名便于前端展示） */
  @ApiProperty({ description: '原始文件名(RAG模块专属)' })
  @Column({ type: 'varchar', name: 'file_name', comment: '原始文件名(RAG模块专属)' })
  public fileName: number

  /** 父级文件夹 id，0 表示根目录 */
  @ApiProperty({ description: '父级文件夹ID，0表示根目录' })
  @Column({ type: 'int', name: 'parent_id', comment: '父级文件夹ID，0表示根目录' })
  public parentId: number

  /** 是否文件夹：0-否，1-是 */
  @ApiProperty({ description: '是否文件夹：0否，1是'  })
  @Column({ type: 'tinyint', name: 'is_dir', comment: '是否文文件夹：0否，1是' })
  public isDir: number

  /** RAG 向量化状态：pending / processing / success / failed（小写） */
  @ApiProperty({ description: '向量化状态' })
  @Column({ type: 'varchar', name: 'vector_status', comment: '向量化状态' })
  public vectorStatus: string

  /** RAG 链路标识：VECTOR（文本向量） / SQL（结构化表格） */
  @ApiProperty({ description: 'RAG链路：VECTOR(文本向量), SQL(结构化表格)' })
  @Column({ type: 'varchar', name: 'rag_track', comment: 'RAG链路：VECTOR(文本向量), SQL(结构化表格)' })
  public ragTrack: string

  /** Text-to-SQL 轨道专属：动态生成的物理表名（ragTrack=SQL 时使用） */
  @ApiProperty({ description: 'Text-to-SQL 轨道专属：动态生成的物理表名' })
  @Column({ type: 'varchar', name: 'associated_table', comment: 'Text-to-SQL 轨道专属：动态生成的物理表名' })
  public associatedTable: string

  /** 业务描述字段（纯字符串或 JSON 字符串） */
  @ApiProperty({ description: '业务描述字段，可以字符串，也可以是 JSON 字符串' })
  @Column({ type: 'varchar', length: 200, comment: '业务描述字段，可以字符串，也可以是 JSON 字符串' })
  public business: string

  /** 服务器本地落盘绝对路径（输出时屏蔽） */
  @Exclude({ toPlainOnly: true }) // 输出屏蔽
  @Column({ type: 'varchar', length: 200, comment: '文件存放位置' })
  public location: string

  /** 上传时间（TypeORM 自动填充） */
  @ApiProperty({ description: '上传时间' })
  @CreateDateColumn({ type: 'timestamp', name: 'create_date', comment: '创建时间' })
  createDate: Date | string
}
