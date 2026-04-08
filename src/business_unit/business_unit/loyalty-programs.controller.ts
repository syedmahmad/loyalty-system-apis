import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessUnit } from '../entities/business_unit.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import { Customer } from 'src/customers/entities/customer.entity';
import { TenantApiTokenGuard } from 'src/tenants/guards/tenant-api-token.guard';
import { encrypt } from 'src/helpers/encryption';
import { CheckoutService } from 'src/business_unit/checkout.service';
import {
  GetBurnRuleDto,
  RequestTransactionDto,
  ConfirmTransactionDto,
  RefundTransactionDto,
} from 'src/business_unit/dto/checkout.dto';

/**
 * LoyaltyController — Base route: /loyalty
 *
 * External-facing APIs consumed by checkout pages, POS systems, and any
 * third-party integration. All endpoints require:
 *   Authorization: Bearer <tenant-api-token>
 *
 * Routes:
 *   GET  /loyalty/programs            — list programs + customer points
 *   GET  /loyalty/burn-rule           — burn rule + optional simulation
 *   POST /loyalty/request-transaction — create pending burn (NOT_CONFIRMED)
 *   POST /loyalty/confirm-transaction — finalise + deduct wallet
 *   POST /loyalty/refund              — full refund via ADJUSTMENT transaction
 */
@UseGuards(TenantApiTokenGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly buRepo: Repository<BusinessUnit>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    private readonly checkoutService: CheckoutService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // GET /loyalty/programs
  //
  // Returns all active loyalty programs for the tenant.
  // If customer_phone is provided, includes the customer's points balance
  // for each points-type program.
  // ─────────────────────────────────────────────────────────────────────────
  @Get('programs')
  async programs(
    @Req() req: any,
    @Query('customer_phone') customerPhone?: string,
  ) {
    const tenantId: number = req.loyaltyTenantId;

    // Resolve customer from phone if provided
    let customerId: number | null = null;
    if (customerPhone) {
      const normalizedPhone = '+' + customerPhone.replace(/^[\s+]+/, '');
      const hashedPhone = encrypt(normalizedPhone);
      const customer = await this.customerRepo.findOne({
        where: { hashed_number: hashedPhone },
        select: ['id'],
      });
      customerId = customer?.id ?? null;
    }

    const businessUnits = await this.buRepo.find({
      where: { status: 1, tenant_id: tenantId },
    });

    const programs = await Promise.all(
      businessUnits
        .filter((bu) => bu.name !== 'All Business Unit')
        .map(async (bu) => {
          // OTP-type programs (e.g. Qitaf) don't have a points balance
          if (bu.type === 'otp') {
            return {
              uuid: bu.uuid,
              name: bu.name,
              description: bu.description,
              type: 'otp',
              points: null,
            };
          }

          // Points-type programs — fetch wallet balance if customer resolved.
          // Wallet is tenant-scoped, not BU-scoped, so look up by tenant_id.
          let points: number | null = null;
          if (customerId) {
            const wallet = await this.walletRepo.findOne({
              where: {
                customer: { id: customerId },
                tenant: { id: tenantId },
              },
            });
            points = wallet?.available_balance ?? null;
          }

          return {
            uuid: bu.uuid,
            name: bu.name,
            description: bu.description,
            type: 'points',
            points,
          };
        }),
    );

    return { programs };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /loyalty/redemption-info
  //
  // Returns the redemption rule for a program + customer's available points.
  // Pass transaction_amount to simulate the max they can redeem on that invoice.
  // ─────────────────────────────────────────────────────────────────────────
  @Get('redemption-info')
  async redemptionInfo(
    @Req() req,
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    dto: GetBurnRuleDto,
  ) {
    return this.checkoutService.getBurnRule(req.loyaltyTenantId, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /loyalty/request-transaction
  //
  // Creates a pending (NOT_CONFIRMED) burn transaction.
  // Call this when the customer selects how many points to apply.
  // Returns transaction_id — pass to confirm-transaction after payment.
  // ─────────────────────────────────────────────────────────────────────────
  @Post('request-transaction')
  async requestTransaction(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: RequestTransactionDto,
  ) {
    return this.checkoutService.requestTransaction(req.loyaltyTenantId, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /loyalty/confirm-transaction
  //
  // Finalises a pending burn transaction after payment is processed.
  // Deducts points from wallet and marks transaction as ACTIVE.
  // ─────────────────────────────────────────────────────────────────────────
  @Post('confirm-transaction')
  async confirmTransaction(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: ConfirmTransactionDto,
  ) {
    return this.checkoutService.confirmTransaction(req.loyaltyTenantId, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /loyalty/refund
  //
  // Full refund of a completed burn transaction.
  // Returns points to the wallet via a new ADJUSTMENT transaction.
  // Partial refund is not supported — always refunds 100% of burned points.
  // ─────────────────────────────────────────────────────────────────────────
  @Post('refund')
  async refund(
    @Req() req,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: RefundTransactionDto,
  ) {
    return this.checkoutService.refund(req.loyaltyTenantId, dto);
  }
}
