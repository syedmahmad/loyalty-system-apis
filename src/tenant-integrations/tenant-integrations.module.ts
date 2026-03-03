import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantIntegrationsService } from './tenant-integrations/tenant-integrations.service';
import { TenantIntegrationsController } from './tenant-integrations/tenant-integrations.controller';
import { TenantPartnerIntegration } from './entities/tenant-partner-integration.entity';
import { Partner } from 'src/partners/entities/partner.entity';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantPartnerIntegration, Partner, User]),
  ],
  controllers: [TenantIntegrationsController],
  providers: [TenantIntegrationsService],
  exports: [TenantIntegrationsService],
})
export class TenantIntegrationsModule {}
