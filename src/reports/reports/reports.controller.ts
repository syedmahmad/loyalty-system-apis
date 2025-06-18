import { Controller, Get } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { Tenant } from 'src/common/decorators/tenant.decorator';
import { Tenant as TenantEntity } from 'src/tenants/entities/tenant.entity';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('points-summary')
  getPointsSummary(@Tenant() tenant: TenantEntity) {
    return this.reportsService.getPointsSummary(tenant.id);
  }

  @Get('campaign-performance')
  getCampaignPerformance(@Tenant() tenant: TenantEntity) {
    return this.reportsService.getCampaignPerformance(tenant.id);
  }

  @Get('tier-distribution')
  getTierDistribution(@Tenant() tenant: TenantEntity) {
    return this.reportsService.getTierDistribution(tenant.id);
  }

  @Get('reward-redemptions')
  getRewardRedemptions(@Tenant() tenant: TenantEntity) {
    return this.reportsService.getRewardRedemptions(tenant.id);
  }
}
