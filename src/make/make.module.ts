import { Module } from '@nestjs/common';
import { MakeController } from './make/make.controller';
import { MakeService } from './make/make.service';
import { MakeEntity } from './entities/make.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelEntity } from 'src/model/entities/model.entity';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [TypeOrmModule.forFeature([MakeEntity, ModelEntity]), HttpModule],
  controllers: [MakeController],
  providers: [MakeService],
  exports: [MakeService],
})
export class MakeModule {}
