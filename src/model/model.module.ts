import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelEntity } from './entities/model.entity';
import { ModelController } from './model/model.controller';
import { ModelService } from './model/model.service';
import { MakeService } from 'src/make/make/make.service';
import { MakeEntity } from 'src/make/entities/make.entity';
import { HttpModule } from '@nestjs/axios';
import { VariantEntity } from 'src/variant/entities/variant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ModelEntity, MakeEntity, VariantEntity]),
    HttpModule,
  ],
  controllers: [ModelController],
  providers: [ModelService, MakeService],
  exports: [ModelService, MakeService],
})
export class ModelModule {}
