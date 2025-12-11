import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
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
  @Get('get-point-splits')
  getPointsSplit(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.pointsSplit(
      req.permission,
      startDate,
      endDate,
    );
  }

  @UseGuards(AnalyticAccessGuard)
  @ANALYTICSAccess()
  @Get('customer-by-points')
  getCustomerByPoints(@Req() req: any) {
    return this.loyaltyAnalyticsService.getCustomerByPoints(req.permission);
  }

  @UseGuards(AnalyticAccessGuard)
  @ANALYTICSAccess()
  @Get('get-point-summary')
  getSummary(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.getSummary(
      req.permission,
      startDate,
      endDate,
    );
  }

  @UseGuards(AnalyticAccessGuard)
  @ANALYTICSAccess()
  @Get('get-item-usage')
  getItemUsage(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.itemUsage(
      req.permission,
      startDate,
      endDate,
    );
  }

  @UseGuards(AnalyticAccessGuard)
  @ANALYTICSAccess()
  @Get('get-bar-chart')
  getBarChart(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.barChart(
      req.permission,
      startDate,
      endDate,
    );
  }

  @UseGuards(AnalyticAccessGuard)
  @ANALYTICSAccess()
  @Get('coupon/:client_id')
  getCouponAnalytics(
    @Param('client_id') client_id: number,
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loyaltyAnalyticsService.getCouponAnalytics(
      client_id,
      req.permission,
      startDate,
      endDate,
    );
  }
}
