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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tier,
      RuleTarget,
      BusinessUnit,
      User,
      Tenant,
      Wallet,
    ]),
  ],
  controllers: [TiersController],
  providers: [TiersService],
})
export class TiersModule {}
