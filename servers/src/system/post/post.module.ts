import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { PostEntity } from './post.entity'
import { PostService } from './post.service'
import { PostController } from './post.controller'

/**
 * 岗位模块 PostModule
 * - 注册 PostEntity 的 Repository
 * - 提供 PostService（CRUD）与 PostController（/post 路由）
 */
@Module({
  imports: [TypeOrmModule.forFeature([PostEntity])],
  providers: [PostService],
  controllers: [PostController],
})
export class PostModule {}
