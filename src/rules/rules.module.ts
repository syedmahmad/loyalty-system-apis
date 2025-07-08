import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuleTarget } from './entities/rule-target.entity';
import { Rule } from './entities/rules.entity';
import { RulesController } from './rule/rules.controller';
import { RulesService } from './rule/rules.service';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Rule, RuleTarget, User])],
  controllers: [RulesController],
  providers: [RulesService],
})
export class RulesModule {}
