import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantPartnerTerminal } from './entities/tenant-partner-terminal.entity';
import { TenantPartnerIntegration } from 'src/tenant-integrations/entities/tenant-partner-integration.entity';
import { User } from 'src/users/entities/user.entity';
import { TenantPartnerTerminalsService } from './tenant-partner-terminals/tenant-partner-terminals.service';
import { TenantPartnerTerminalsController } from './tenant-partner-terminals/tenant-partner-terminals.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantPartnerTerminal, TenantPartnerIntegration, User]),
  ],
  controllers: [TenantPartnerTerminalsController],
  providers: [TenantPartnerTerminalsService],
  exports: [TenantPartnerTerminalsService],
})
export class TenantPartnerTerminalsModule {}
