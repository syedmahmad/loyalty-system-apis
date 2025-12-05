import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { LoyaltyAnalyticsService } from './analytics.service';
import { AnalyticAccessGuard } from './analytics-access.guard';
import { ANALYTICSAccess } from './analytics-access.decorator';

@Controller('loyalty/analytics')
export class LoyaltyAnalyticsController {
  constructor(
    private readonly loyaltyAnalyticsService: LoyaltyAnalyticsService,
  ) {}

  @UseGuards(AnalyticAccessGuard)
  @ANALYTICSAccess()
  @Get('dashboard')
  getLoyaltyDashboard(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.getLoyaltyDashboard(
      req.permission,
      startDate,
      endDate,
    );
  }

  @UseGuards(AnalyticAccessGuard)
  @ANALYTICSAccess()
  @Get('coupon')
  getCouponAnalytics(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.getCouponAnalytics(
      req.permission,
      startDate,
      endDate,
    );
  }
}
