import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiersService } from './tiers/tiers.service';
import { TiersController } from './tiers/tiers.controller';
import { Tier } from './entities/tier.entity';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tier, RuleTarget, BusinessUnit])],
  controllers: [TiersController],
  providers: [TiersService],
})
export class TiersModule {}
