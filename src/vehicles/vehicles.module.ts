import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';
import { Customer } from 'src/customers/entities/customer.entity';
import { MakeEntity } from 'src/make/entities/make.entity';
import { ModelEntity } from 'src/model/entities/model.entity';
import { Log } from 'src/logs/entities/log.entity';
import { VariantEntity } from 'src/variant/entities/variant.entity';
import { OpenaiModule } from 'src/openai/openai.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Vehicle,
      Customer,
      MakeEntity,
      ModelEntity,
      VariantEntity,
      Log,
    ]),
    OpenaiModule,
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehicleModule {}
