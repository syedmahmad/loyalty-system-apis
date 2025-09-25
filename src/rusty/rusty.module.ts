import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RustyUser } from './entities/rusty-users.entity';
import { JobcardsInvoice } from './entities/rusty-invoices.entity';
import { RustyJobcard } from './entities/rusty-jobcards.entity';
import { Vehicle } from './entities/rusty-vehicles.entity';
import { RustyWorkshop } from './entities/rusty-workshops.entity';
import { Service as RustyEntity } from './entities/rusty-services.entity';
import { RustyController } from './rusty/rusty.controller';
import { RustyService } from './rusty/rusty.service';
import { RustyInvoiceItem } from './entities/rusty-invoice-items.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RustyUser,
      JobcardsInvoice,
      RustyJobcard,
      RustyInvoiceItem,
      Vehicle,
      RustyWorkshop,
      RustyEntity,
    ]),
  ],
  controllers: [RustyController],
  providers: [RustyService],
})
export class RustyModule {}
