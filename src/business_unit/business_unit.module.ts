import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessUnit } from './entities/business_unit.entity';
import { BusinessUnitsController } from './business_unit/business_unit.controller';
import { BusinessUnitsService } from './business_unit/business_unit.service';
import { BusinessUnitBootstrapService } from './startup/business-unit-bootstrap.service';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { User } from 'src/users/entities/user.entity';
import { BusinessUnitMiddleware } from './middleware/business_unit.middleware';
import { LoyaltyController } from './business_unit/loyalty-programs.controller';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { CheckoutService } from 'src/business_unit/checkout.service';
import { QitafModule } from 'src/qitaf/qitaf.module';
import { BurnOtp } from 'src/petromin-it/burning/entities/burn-otp.entity';
import { OciService } from 'src/oci/oci.service';
import { NotificationModule } from 'src/petromin-it/notification/notification.module';
import { DeviceToken } from 'src/petromin-it/notification/entities/device-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessUnit,
      Tenant,
      User,
      Wallet,
      Customer,
      WalletTransaction,
      Rule,
      BurnOtp,
      DeviceToken,
    ]),
    QitafModule, // provides QitafService for OTP-based program routing
    NotificationModule,
  ],
  controllers: [BusinessUnitsController, LoyaltyController],
  providers: [
    BusinessUnitsService,
    BusinessUnitBootstrapService,
    BusinessUnitMiddleware,
    CheckoutService,
    OciService,
  ],
})
export class BusinessUnitsModule {}
