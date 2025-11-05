import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';
import { Customer } from 'src/customers/entities/customer.entity';
import { MakeEntity } from 'src/make/entities/make.entity';
import { ModelEntity } from 'src/model/entities/model.entity';
import { Log } from 'src/logs/entities/log.entity';
import { VariantEntity } from 'src/variant/entities/variant.entity';
import { AuthModule } from 'src/petromin-it/auth/auth.module';
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

    forwardRef(() => AuthModule),
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehicleModule {}
