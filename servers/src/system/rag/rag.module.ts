import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RagService } from './rag.service'
import { RagController } from './rag.controller'
import { RagFileEntity } from './rag-file.entity'

import { UserModule } from '../user/user.module'

@Module({
  imports: [UserModule, TypeOrmModule.forFeature([RagFileEntity])],
  providers: [RagService],
  controllers: [RagController],
})
export class RagModule {}
