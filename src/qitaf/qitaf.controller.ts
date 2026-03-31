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
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { AuthTokenGuard } from 'src/users/guards/authTokenGuard';
import { QitafAuthGuard } from './qitaf-auth.guard';
import { QitafService } from './qitaf.service';
import {
  GenerateQitafTokenDto,
  GetQitafTokenDto,
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
 * Two groups of endpoints:
 *
 * 1. /qitaf/auth/*  (admin only — uses AuthTokenGuard)
 *    Admin generates a Bearer token for the POS system.
 *    Token is saved to the DB and shown in the admin UI for copy-paste.
 *    Token contains tenantId + partnerId — no hardcoding on POS side.
 *
 * 2. /qitaf/redemption/* and /qitaf/earn/*  (POS system — uses QitafAuthGuard)
 *    POS includes "Authorization: Bearer <token>" on every request.
 */
@Controller('qitaf')
export class QitafController {
  constructor(private readonly qitafService: QitafService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // TOKEN MANAGEMENT  (Admin panel only)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /qitaf/auth/token
   *
   * Generate (or regenerate) a POS API token for a tenant+partner integration.
   * Token is saved to the DB and returned for display in the admin UI.
   * No expiry — regenerate from admin panel if compromised.
   *
   * Body: { tenant_id: 1, partner_id: 1 }
   */
  @UseGuards(AuthTokenGuard)
  @Post('auth/token')
  async generateToken(
    @Body(new ValidationPipe({ whitelist: true })) dto: GenerateQitafTokenDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret header is required');
    }
    return this.qitafService.generateToken(dto);
  }

  /**
   * GET /qitaf/auth/token?tenant_id=1&partner_id=1
   *
   * Retrieve the currently stored POS API token for a tenant+partner.
   * Returns { token: string | null } — null if not yet generated.
   */
  @UseGuards(AuthTokenGuard)
  @Get('auth/token')
  async getToken(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    dto: GetQitafTokenDto,
    @Headers('user-secret') userSecret: string,
  ) {
    if (!userSecret) {
      throw new BadRequestException('user-secret header is required');
    }
    return this.qitafService.getToken(dto);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REDEMPTION FLOW  (POS system — requires Bearer token)
  // Step 1: Request OTP  →  Step 2: Redeem  →  Step 3: Reverse (if needed)
  // ──────────────────────────────────────────────────────────────────────────

  @UseGuards(QitafAuthGuard)
  @Post('redemption/otp')
  async requestOtp(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: RedemptionOtpDto,
  ) {
    return this.qitafService.requestOtp(
      req.qitafTenantId,
      req.qitafPartnerId,
      dto,
    );
  }

  @UseGuards(QitafAuthGuard)
  @Post('redemption/redeem')
  async redeemPoints(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: RedemptionRedeemDto,
  ) {
    return this.qitafService.redeemPoints(
      req.qitafTenantId,
      req.qitafPartnerId,
      dto,
    );
  }

  @UseGuards(QitafAuthGuard)
  @Put('redemption/reverse')
  async reverseRedeem(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: RedemptionReverseDto,
  ) {
    return this.qitafService.reverseRedeem(
      req.qitafTenantId,
      req.qitafPartnerId,
      dto,
    );
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
  @UseGuards(QitafAuthGuard)
  @Put('redemption/reverse-by-msisdn')
  async reverseRedeemByMsisdn(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: ReversalByMsisdnDto,
  ) {
    return this.qitafService.reverseRedeemByMsisdn(
      req.qitafTenantId,
      req.qitafPartnerId,
      dto.Msisdn,
      dto.BranchId,
      dto.TerminalId,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EARN FLOW  (POS system — requires Bearer token)
  // ──────────────────────────────────────────────────────────────────────────

  @UseGuards(QitafAuthGuard)
  @Post('earn/reward')
  async earnReward(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: EarnRewardDto,
  ) {
    return this.qitafService.earnReward(
      req.qitafTenantId,
      req.qitafPartnerId,
      dto,
    );
  }

  @UseGuards(QitafAuthGuard)
  @Post('earn/reward-incentive')
  async earnRewardIncentive(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: EarnRewardIncentiveDto,
  ) {
    return this.qitafService.earnRewardIncentive(
      req.qitafTenantId,
      req.qitafPartnerId,
      dto,
    );
  }

  @UseGuards(QitafAuthGuard)
  @Put('earn/update')
  async updateReward(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: EarnUpdateDto,
  ) {
    return this.qitafService.updateReward(
      req.qitafTenantId,
      req.qitafPartnerId,
      dto,
    );
  }

  @UseGuards(QitafAuthGuard)
  @Post('earn/reward/status')
  async rewardStatus(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true })) dto: EarnRewardStatusDto,
  ) {
    return this.qitafService.rewardStatus(
      req.qitafTenantId,
      req.qitafPartnerId,
      dto,
    );
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
