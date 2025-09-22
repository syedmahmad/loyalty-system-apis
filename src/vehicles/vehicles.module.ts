import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';
import { Customer } from 'src/customers/entities/customer.entity';
import { MakeEntity } from 'src/make/entities/make.entity';
import { ModelEntity } from 'src/model/entities/model.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, Customer, MakeEntity, ModelEntity]),
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehicleModule {}
