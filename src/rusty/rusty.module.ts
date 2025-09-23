import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RustyCustomer } from './entities/rusty-customers.entity';
import { RustyInvoice } from './entities/rusty-invoices.entity';
import { RustyJobcard } from './entities/rusty-jobcards.entity';
import { RustyVehicle } from './entities/rusty-vehicles.entity';
import { RustyWorkshop } from './entities/rusty-workshops.entity';
import { RustyService as RustyEntity } from './entities/rusty-services.entity';
import { RustyController } from './rusty/rusty.controller';
import { RustyService } from './rusty/rusty.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RustyCustomer,
      RustyInvoice,
      RustyJobcard,
      RustyVehicle,
      RustyWorkshop,
      RustyEntity,
    ]),
  ],
  controllers: [RustyController],
  providers: [RustyService],
})
export class RustyModule {}
