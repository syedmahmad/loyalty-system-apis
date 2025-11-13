import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { OciService } from 'src/oci/oci.service';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { OffersEntity } from './entities/offers.entity';
import { OffersController } from './offers/offers.controller';
import { OffersService } from './offers/offers.service';
import { CustomerSegment } from 'src/customer-segment/entities/customer-segment.entity';
import { OfferCustomerSegment } from './entities/offer-customer-segments.entity';
import { CustomerSegmentMember } from 'src/customer-segment/entities/customer-segment-member.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { UserOffer } from './entities/user-offer.entity';
import { OfferLocalEntity } from './entities/offer-locale.entity';
import { LanguageEntity } from 'src/master/language/entities/language.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OffersEntity,
      BusinessUnit,
      Tenant,
      User,
      CustomerSegment,
      OfferCustomerSegment,
      CustomerSegmentMember,
      UserOffer,
      Customer,
      OfferLocalEntity,
      LanguageEntity,
    ]),
  ],
  controllers: [OffersController],
  providers: [OffersService, OciService],
  exports: [OffersService],
})
export class OffersModule {}
