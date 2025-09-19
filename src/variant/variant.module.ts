import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelEntity } from 'src/model/entities/model.entity';
import { VariantEntity } from './entities/variant.entity';
import { VariantController } from './variant/variant.controller';
import { VariantService } from './variant/variant.service';
import { ModelService } from 'src/model/model/model.service';
import { MakeService } from 'src/make/make/make.service';
import { MakeEntity } from 'src/make/entities/make.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MakeEntity, ModelEntity, VariantEntity]),
    HttpModule,
  ],
  controllers: [VariantController],
  providers: [VariantService, ModelService, MakeService],
  exports: [VariantService, ModelService, MakeService],
})
export class VariantModule {}
