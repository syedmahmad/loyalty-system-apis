import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RuleTarget } from './entities/rule-target.entity';
import { Rule } from './entities/rules.entity';
import { RulesController } from './rule/rules.controller';
import { RulesService } from './rule/rules.service';
import { User } from 'src/users/entities/user.entity';
import { Tenant } from 'src/tenants/entities/tenant.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { RuleTier } from './entities/rules-tier';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Rule,
      RuleTarget,
      User,
      Tenant,
      BusinessUnit,
      RuleTier,
    ]),
  ],
  controllers: [RulesController],
  providers: [RulesService],
})
export class RulesModule {}
