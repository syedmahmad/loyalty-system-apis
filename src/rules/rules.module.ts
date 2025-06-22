import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuleTarget } from './entities/rule-target.entity';
import { Rule } from './entities/rules.entity';
import { RulesController } from './rule/rules.controller';
import { RulesService } from './rule/rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([Rule, RuleTarget])],
  controllers: [RulesController],
  providers: [RulesService],
})
export class RulesModule {}
