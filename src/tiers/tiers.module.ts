import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiersService } from './tiers/tiers.service';
import { TiersController } from './tiers/tiers.controller';
import { Tier } from './entities/tier.entity';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { OciService } from 'src/oci/oci.service';
import { Customer } from 'src/customers/entities/customer.entity';
import { WalletService } from 'src/wallet/wallet/wallet.service';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { WalletSettings } from 'src/wallet/entities/wallet-settings.entity';
import { UserCoupon } from 'src/wallet/entities/user-coupon.entity';
import { WalletOrder } from 'src/wallet/entities/wallet-order.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { OpenaiModule } from 'src/openai/openai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tier,
      RuleTarget,
      BusinessUnit,
      User,
      Tenant,
      Wallet,
      Customer,
      WalletTransaction,
      WalletSettings,
      UserCoupon,
      WalletOrder,
      Rule,
      WalletSettings,
    ]),
    OpenaiModule,
  ],
  controllers: [TiersController],
  providers: [TiersService, OciService, WalletService],
  exports: [TiersService],
})
export class TiersModule {}
