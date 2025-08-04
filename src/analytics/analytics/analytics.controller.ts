import { Controller, Get, Query } from '@nestjs/common';
import { LoyaltyAnalyticsService } from './analytics.service';

@Controller('loyalty/analytics')
export class LoyaltyAnalyticsController {
  constructor(
    private readonly loyaltyAnalyticsService: LoyaltyAnalyticsService,
  ) {}

  @Get('dashboard')
  getLoyaltyDashboard(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.getLoyaltyDashboard(startDate, endDate);
  }

  @Get('coupon')
  getCouponAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.getCouponAnalytics(startDate, endDate);
  }
}
