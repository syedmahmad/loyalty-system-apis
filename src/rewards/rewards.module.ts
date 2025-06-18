import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardsService } from './rewards/rewards.service';
import { RewardsController } from './rewards/rewards.controller';
import { Reward } from './entities/reward.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Reward])],
  controllers: [RewardsController],
  providers: [RewardsService],
})
export class RewardsModule {}
