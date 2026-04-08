import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
  Req,
  Param,
  ParseIntPipe,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { TenantApiTokenGuard } from 'src/tenants/guards/tenant-api-token.guard';
import { QitafService } from './qitaf.service';
import {
  RedemptionOtpDto,
  RedemptionRedeemDto,
  RedemptionReverseDto,
  ReversalByMsisdnDto,
  EarnRewardDto,
  EarnRewardIncentiveDto,
  EarnUpdateDto,
  EarnRewardStatusDto,
} from './dto/qitaf.dto';

/**
 * QitafController — Base route: /qitaf
 *
 * POS endpoints use the standard tenant API token (same JWT used across the
 * loyalty API) — no separate Qitaf token needed.
 *
 * Authorization: Bearer <tenant-api-token>  on every /qitaf/redemption/* and /qitaf/earn/* request.
 */
@Controller('qitaf')
export class QitafController {
  constructor(private readonly qitafService: QitafService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // REDEMPTION FLOW  (POS system — requires Bearer token)
  // Step 1: Request OTP  →  Step 2: Redeem  →  Step 3: Reverse (if needed)
  // ──────────────────────────────────────────────────────────────────────────

  @UseGuards(TenantApiTokenGuard)
  @Post('redemption/otp')
  async requestOtp(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: RedemptionOtpDto,
  ) {
    return this.qitafService.requestOtp(req.loyaltyTenantId, dto);
  }

  @UseGuards(TenantApiTokenGuard)
  @Post('redemption/redeem')
  async redeemPoints(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: RedemptionRedeemDto,
  ) {
    return this.qitafService.redeemPoints(req.loyaltyTenantId, dto);
  }

  @UseGuards(TenantApiTokenGuard)
  @Put('redemption/reverse')
  async reverseRedeem(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: RedemptionReverseDto,
  ) {
    return this.qitafService.reverseRedeem(req.loyaltyTenantId, dto);
  }

  /**
   * PUT /qitaf/redemption/reverse-by-msisdn
   *
   * Cashier-friendly reverse — no UUID or date required.
   *
   * The standard reverse endpoint (/redemption/reverse) requires RefRequestId
   * (the UUID we sent to STC) and RefRequestDate — values the cashier cannot
   * realistically know. This endpoint solves that problem.
   *
   * The cashier only provides what they already have at the counter:
   *   - Msisdn    → customer's Saudi mobile number
   *   - BranchId  → their store's STC branch code
   *   - TerminalId → their POS terminal code
   *
   * We then look up our own qitaf_transactions table to find the most recent
   * successful redemption for that Msisdn and automatically fill in the
   * RefRequestId and RefRequestDate before calling STC.
   *
   * Errors:
   *   - 400 if no successful redemption exists for the given Msisdn
   *   - Any STC error is forwarded as-is
   */
  @UseGuards(TenantApiTokenGuard)
  @Put('redemption/reverse-by-msisdn')
  async reverseRedeemByMsisdn(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: ReversalByMsisdnDto,
  ) {
    return this.qitafService.reverseRedeemByMsisdn(
      req.loyaltyTenantId,
      dto.Msisdn,
      dto.BranchId,
      dto.TerminalId,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EARN FLOW  (POS system — requires Bearer token)
  // ──────────────────────────────────────────────────────────────────────────

  @UseGuards(TenantApiTokenGuard)
  @Post('earn/reward')
  async earnReward(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: EarnRewardDto,
  ) {
    return this.qitafService.earnReward(req.loyaltyTenantId, dto);
  }

  @UseGuards(TenantApiTokenGuard)
  @Post('earn/reward-incentive')
  async earnRewardIncentive(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: EarnRewardIncentiveDto,
  ) {
    return this.qitafService.earnRewardIncentive(req.loyaltyTenantId, dto);
  }

  @UseGuards(TenantApiTokenGuard)
  @Put('earn/update')
  async updateReward(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: EarnUpdateDto,
  ) {
    return this.qitafService.updateReward(req.loyaltyTenantId, dto);
  }

  @UseGuards(TenantApiTokenGuard)
  @Post('earn/reward/status')
  async rewardStatus(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: EarnRewardStatusDto,
  ) {
    return this.qitafService.rewardStatus(req.loyaltyTenantId, dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CUSTOMER TRANSACTION HISTORY  (Admin panel only)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /qitaf/transactions/by-customer/:customerId?page=1&limit=10
   *
   * Returns paginated Qitaf transaction history for a given customer.
   * Decrypts the customer's hashed_number to resolve their Msisdn, then
   * queries qitaf_transactions by that Msisdn + tenant.
   */
  @UseGuards(AuthTokenGuard)
  @Get('transactions/by-customer/:customerId')
  async getCustomerTransactions(
    @Param('customerId', ParseIntPipe) customerId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.qitafService.getCustomerTransactions(
      customerId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }
}
