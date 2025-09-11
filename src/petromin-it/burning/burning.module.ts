import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from 'src/customers/entities/customer.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { WalletTransaction } from 'src/wallet/entities/wallet-transaction.entity';
import { Tier } from 'src/tiers/entities/tier.entity';
import { BurningController } from './burning/burning.controller';
import { TiersService } from 'src/tiers/tiers/tiers.service';
import { BurningService } from './burning/burning.service';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { OciModule } from 'src/oci/oci.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { Rule } from 'src/rules/entities/rules.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      Wallet,
      WalletTransaction,
      Tier,
      BusinessUnit,
      User,
      Tenant,
      Rule,
    ]),
    OciModule,
    WalletModule,
  ],
  controllers: [BurningController],
  providers: [BurningService, TiersService],
  exports: [BurningService],
})
export class BurningModule {}
