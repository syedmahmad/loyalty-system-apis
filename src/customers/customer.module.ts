import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { Customer } from 'src/customers/entities/customer.entity';
import { User } from 'src/users/entities/user.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { BusinessUnitMiddleware } from 'src/business_unit/middleware/business_unit.middleware';
import { WalletModule } from 'src/wallet/wallet.module';
import { OciModule } from 'src/oci/oci.module';
import { QrCode } from 'src/qr_codes/entities/qr_code.entity';
import { QrcodesService } from '../qr_codes/qr_codes/qr_codes.service';
import { CustomerActivity } from 'src/customers/entities/customer-activity.entity';
import { Tier } from 'src/tiers/entities/tier.entity';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      User,
      BusinessUnit,
      QrCode,
      CustomerActivity,
      Tier,
      RuleTarget,
      Wallet,
      Tenant,
    ]),
    WalletModule,
    OciModule,
  ],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    BusinessUnitMiddleware,
    QrcodesService,
    TiersService,
  ],
})
export class CustomerModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BusinessUnitMiddleware).forRoutes(
      {
        path: 'customers',
        method: RequestMethod.POST,
      },
      { path: 'customers/single/:uuid', method: RequestMethod.GET },
    );
  }
}
