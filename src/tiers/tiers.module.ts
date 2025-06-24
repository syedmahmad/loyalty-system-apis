import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiersService } from './tiers/tiers.service';
import { TiersController } from './tiers/tiers.controller';
import { Tier } from './entities/tier.entity';
import { RuleTarget } from 'src/rules/entities/rule-target.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tier, RuleTarget])],
  controllers: [TiersController],
  providers: [TiersService],
})
export class TiersModule {}
