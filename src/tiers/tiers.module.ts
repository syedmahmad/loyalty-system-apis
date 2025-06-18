import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiersService } from './tiers/tiers.service';
import { TiersController } from './tiers/tiers.controller';
import { Tier } from './entities/tier.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tier])],
  controllers: [TiersController],
  providers: [TiersService],
})
export class TiersModule {}
