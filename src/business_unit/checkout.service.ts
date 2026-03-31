import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from 'src/customers/entities/customer.entity';
import { Wallet } from 'src/wallet/entities/wallet.entity';
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from 'src/wallet/entities/wallet-transaction.entity';
import { Rule } from 'src/rules/entities/rules.entity';
import { BusinessUnit } from 'src/business_unit/entities/business_unit.entity';
import { encrypt } from 'src/helpers/encryption';
import {
  ConfirmTransactionDto,
  GetBurnRuleDto,
  RefundTransactionDto,
  RequestTransactionDto,
} from './dto/checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(WalletTransaction)
    private readonly txnRepo: Repository<WalletTransaction>,

    @InjectRepository(Rule)
    private readonly ruleRepo: Repository<Rule>,

    @InjectRepository(BusinessUnit)
    private readonly buRepo: Repository<BusinessUnit>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — normalise + encrypt phone
  //
  // Phone arrives in many forms:
  //   "966501234567"  →  "+966501234567"
  //   "+966501234567" →  "+966501234567"
  //   " 966501234567" →  "+966501234567"  (URL-decoded space from + sign)
  //
  // We always store with leading + in hashed_number so we must match exactly.
  // ─────────────────────────────────────────────────────────────────────────
  private hashPhone(phone: string): string {
    const normalised = '+' + phone.replace(/^[\s+]+/, '');
    return encrypt(normalised);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — resolve customer by phone, validate active status
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveCustomer(phone: string): Promise<Customer> {
    const hashed = this.hashPhone(phone);
    const customer = await this.customerRepo.findOne({
      where: { hashed_number: hashed, status: 1 },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found or inactive');
    }
    return customer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — resolve business unit by UUID, validate it belongs to tenant
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveBu(
    programUuid: string,
    tenantId: number,
  ): Promise<BusinessUnit> {
    const bu = await this.buRepo.findOne({
      where: { uuid: programUuid, tenant_id: tenantId, status: 1 },
    });
    if (!bu) {
      throw new NotFoundException('Program not found or not active');
    }
    return bu;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — resolve wallet for a specific customer + business unit
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveWallet(
    customerId: number,
    buId: number,
  ): Promise<Wallet> {
    const wallet = await this.walletRepo.findOne({
      where: {
        customer: { id: customerId },
        business_unit: { id: buId },
      },
    });
    if (!wallet) {
      throw new NotFoundException(
        'Wallet not found for this customer and program',
      );
    }
    return wallet;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — fetch active burn rule for a tenant + business unit
  //
  // A business unit (program) has one burn rule that defines:
  //   - max_burn_percent_on_invoice  : max % of invoice that can be paid with points
  //   - points_conversion_factor     : 1 point = X SAR
  //   - max_redeemption_points_limit : hard cap on points per transaction
  //   - min_amount_spent             : minimum invoice amount for rule to activate
  //   - frequency                    : AnyTime | once | daily | yearly
  // ─────────────────────────────────────────────────────────────────────────
  private async resolveBurnRule(
    tenantId: number,
    buId: number,
  ): Promise<Rule> {
    const rule = await this.ruleRepo.findOne({
      where: {
        rule_type: 'burn',
        tenant_id: tenantId,
        business_unit_id: buId,
        status: 1,
      },
    });
    if (!rule) {
      throw new NotFoundException(
        'No active burn rule found for this program. Contact support.',
      );
    }
    return rule;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPER — calculate the maximum points a customer can burn
  //
  // The cap is the LOWEST of three limits:
  //   1. Customer's available wallet balance
  //   2. Rule's hard point cap (max_redeemption_points_limit)
  //   3. Rule's invoice % cap  (max_burn_percent_on_invoice)
  //      — converted back to points via conversion factor
  //
  // Returns { pointsToBurn, discountAmount } both already floored/consistent.
  // ─────────────────────────────────────────────────────────────────────────
  private calculateMaxBurn(
    availablePoints: number,
    rule: Rule,
    transactionAmount: number,
  ): { pointsToBurn: number; discountAmount: number } {
    // Start with the lower of: wallet balance vs rule's point cap
    let pointsToBurn = Math.min(
      availablePoints,
      rule.max_redeemption_points_limit,
    );

    // Convert to money
    let discountAmount = pointsToBurn * rule.points_conversion_factor;

    // Cap by max allowed % of invoice
    const maxAllowedDiscount =
      (transactionAmount * rule.max_burn_percent_on_invoice) / 100;

    // If the discount would exceed the % cap, pull it back down
    if (discountAmount > maxAllowedDiscount) {
      discountAmount = maxAllowedDiscount;
      // Recalculate points from capped discount (floor to avoid fractional points)
      pointsToBurn = Math.floor(discountAmount / rule.points_conversion_factor);
      // Recalc discount from floored points to keep values consistent
      discountAmount = pointsToBurn * rule.points_conversion_factor;
    }

    return { pointsToBurn, discountAmount };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /loyalty/burn-rule
  //
  // Returns everything the checkout page needs to show the customer:
  //   - Their available points for the selected program
  //   - The burn rule (limits, conversion rate, frequency)
  //   - Optional simulation: if transaction_amount is provided, calculates
  //     exactly how many points they can burn and what discount they get
  //
  // OTP programs: burn-rule is not applicable — returns a clear explanation.
  // ═══════════════════════════════════════════════════════════════════════════
  async getBurnRule(tenantId: number, dto: GetBurnRuleDto) {
    const bu = await this.resolveBu(dto.program_uuid, tenantId);

    // OTP programs (e.g. Qitaf) do not have wallet points or burn rules.
    // Redemption happens via the /qitaf/* OTP flow, not through the wallet.
    if (bu.type === 'otp') {
      return {
        program: { id: bu.id, uuid: bu.uuid, name: bu.name, type: 'otp' },
        message: 'This program uses OTP-based redemption. No burn rule applies.',
        burn_rule: null,
        customer: null,
        simulation: null,
      };
    }

    const customer = await this.resolveCustomer(dto.customer_phone);
    const wallet = await this.resolveWallet(customer.id, bu.id);
    const rule = await this.resolveBurnRule(tenantId, bu.id);

    const response: any = {
      program: { id: bu.id, uuid: bu.uuid, name: bu.name, type: bu.type },
      customer: {
        available_points: wallet.available_balance,
        available_in_sar: +(
          wallet.available_balance * rule.points_conversion_factor
        ).toFixed(2),
      },
      burn_rule: {
        max_burn_percent_on_invoice: rule.max_burn_percent_on_invoice,
        points_conversion_factor: rule.points_conversion_factor,
        max_redeemption_points_limit: rule.max_redeemption_points_limit,
        min_amount_spent: rule.min_amount_spent,
        frequency: rule.frequency,
      },
      simulation: null,
    };

    if (dto.transaction_amount !== undefined) {
      if (dto.transaction_amount < rule.min_amount_spent) {
        response.simulation = {
          eligible: false,
          reason: `Minimum transaction amount is SAR ${rule.min_amount_spent}`,
        };
      } else {
        const { pointsToBurn, discountAmount } = this.calculateMaxBurn(
          wallet.available_balance,
          rule,
          dto.transaction_amount,
        );
        response.simulation = {
          eligible: true,
          max_points_can_burn: pointsToBurn,
          max_discount_sar: +discountAmount.toFixed(2),
          min_amount_to_pay: +(dto.transaction_amount - discountAmount).toFixed(2),
        };
      }
    }

    return response;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /loyalty/request-transaction
  //
  // Creates a pending (NOT_CONFIRMED) transaction. Works for both types:
  //
  //   points — validates wallet + burn rule, confirms the invoice meets the
  //            minimum spend. Creates a placeholder. Actual points_to_burn is
  //            decided at confirm-transaction time (same pattern as the internal
  //            burning module — not locked in at request time).
  //
  //   otp    — no wallet or rule check. Logs the transaction amount as an
  //            audit record. The OTP redemption itself happens through Qitaf.
  //
  // Returns transaction_id (UUID) — pass to confirm-transaction after payment.
  // ═══════════════════════════════════════════════════════════════════════════
  async requestTransaction(tenantId: number, dto: RequestTransactionDto) {
    const bu = await this.resolveBu(dto.program_uuid, tenantId);
    const customer = await this.resolveCustomer(dto.customer_phone);

    // ── OTP program — just log the amount, no wallet interaction ──────────
    if (bu.type === 'otp') {
      const tx = this.txnRepo.create({
        type: WalletTransactionType.BURN,
        status: WalletTransactionStatus.NOT_CONFIRMED,
        customer: { id: customer.id } as any,
        business_unit: { id: bu.id } as any,
        tenant: { id: tenantId } as any,
        amount: dto.transaction_amount,
        point_balance: 0,
        source_type: 'checkout',
        invoice_id: dto.invoice_id ?? null,
        invoice_no: dto.invoice_id ?? null,
        transaction_reference: dto.from_app ?? null,
        created_at: new Date(),
        description: dto.remarks
          ? `OTP checkout: ${dto.remarks}`
          : `OTP checkout: SAR ${dto.transaction_amount} transaction logged`,
      });
      const saved = await this.txnRepo.save(tx);

      return {
        transaction_id: saved.uuid,
        program_type: 'otp',
        transaction_amount: dto.transaction_amount,
        note: 'OTP program — no points reserved. Complete OTP redemption via the Qitaf flow, then call confirm-transaction.',
      };
    }

    // ── Points program — validate wallet + burn rule ───────────────────────
    const wallet = await this.resolveWallet(customer.id, bu.id);
    const rule = await this.resolveBurnRule(tenantId, bu.id);

    if (dto.transaction_amount < rule.min_amount_spent) {
      throw new BadRequestException(
        `Transaction amount SAR ${dto.transaction_amount} is below the minimum required SAR ${rule.min_amount_spent}`,
      );
    }

    // Calculate max the customer could burn — returned for UI reference only.
    // We do NOT lock in points here; the caller decides at confirm-transaction.
    const { pointsToBurn: maxAllowed, discountAmount: maxDiscount } =
      this.calculateMaxBurn(
        wallet.available_balance,
        rule,
        dto.transaction_amount,
      );

    const tx = this.txnRepo.create({
      type: WalletTransactionType.BURN,
      status: WalletTransactionStatus.NOT_CONFIRMED,
      wallet: { id: wallet.id } as any,
      customer: { id: customer.id } as any,
      business_unit: { id: bu.id } as any,
      tenant: { id: tenantId } as any,
      amount: dto.transaction_amount,
      point_balance: 0,             // set on confirm-transaction
      prev_available_points: wallet.available_balance,
      source_type: 'checkout',
      source_id: rule.id,           // stored so confirm-transaction can re-fetch the rule
      invoice_id: dto.invoice_id ?? null,
      invoice_no: dto.invoice_id ?? null,
      transaction_reference: dto.from_app ?? null,
      created_at: new Date(),
      description: dto.remarks
        ? `Checkout: ${dto.remarks}`
        : `Checkout: SAR ${dto.transaction_amount} invoice pending confirmation`,
    });

    const saved = await this.txnRepo.save(tx);

    return {
      transaction_id: saved.uuid,
      program_type: 'points',
      transaction_amount: dto.transaction_amount,
      max_points_can_burn: maxAllowed,
      max_discount_sar: +maxDiscount.toFixed(2),
      note: 'Points not deducted yet. Call confirm-transaction with points_to_burn to finalise.',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /loyalty/confirm-transaction
  //
  // Finalises a pending burn transaction.
  //
  //   points — deducts points_to_burn from wallet, marks transaction ACTIVE.
  //            points_to_burn can be anywhere from 1 to the rule's max allowed.
  //
  //   otp    — just marks the transaction ACTIVE. Pass points_to_burn = 0.
  //            No wallet interaction since OTP programs don't use our wallet.
  // ═══════════════════════════════════════════════════════════════════════════
  async confirmTransaction(tenantId: number, dto: ConfirmTransactionDto) {
    const tx = await this.txnRepo.findOne({
      where: { uuid: dto.transaction_id },
      relations: ['customer', 'wallet', 'business_unit', 'tenant'],
    });

    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    if (tx.status !== WalletTransactionStatus.NOT_CONFIRMED) {
      throw new BadRequestException(
        `Transaction is already ${tx.status}. Cannot confirm again.`,
      );
    }

    if (tx.tenant?.id !== tenantId) {
      throw new BadRequestException('Transaction does not belong to this tenant');
    }

    // ── OTP program — just activate, no wallet touch ───────────────────────
    if (tx.business_unit?.type === 'otp') {
      tx.status = WalletTransactionStatus.ACTIVE;
      tx.description = `OTP checkout confirmed: SAR ${tx.amount} transaction`;
      await this.txnRepo.save(tx);

      return {
        transaction_id: tx.uuid,
        program_type: 'otp',
        points_burned: 0,
        message: 'OTP transaction confirmed. No points were deducted.',
      };
    }

    // ── Points program — deduct wallet ────────────────────────────────────
    const rule = await this.ruleRepo.findOne({ where: { id: tx.source_id } });
    if (!rule) {
      throw new NotFoundException('Burn rule no longer found. Contact support.');
    }

    const wallet = await this.walletRepo.findOne({ where: { id: tx.wallet.id } });

    // Cap by current available balance as a safety net (balance may have changed)
    const pointsToBurn = Math.min(dto.points_to_burn, wallet.available_balance);

    if (pointsToBurn <= 0) {
      throw new BadRequestException(
        'points_to_burn must be greater than 0 for a points program',
      );
    }

    const discountAmount = pointsToBurn * rule.points_conversion_factor;
    const finalAmount = Math.max(0, tx.amount - discountAmount);

    tx.point_balance = pointsToBurn;
    tx.status = WalletTransactionStatus.ACTIVE;
    tx.description = `Checkout confirmed: burned ${pointsToBurn} points for SAR ${discountAmount.toFixed(2)} discount`;
    await this.txnRepo.save(tx);

    wallet.available_balance -= pointsToBurn;
    wallet.total_burned_points += pointsToBurn;
    await this.walletRepo.save(wallet);

    return {
      transaction_id: tx.uuid,
      program_type: 'points',
      points_burned: pointsToBurn,
      discount_amount: +discountAmount.toFixed(2),
      final_amount: +finalAmount.toFixed(2),
      remaining_points: wallet.available_balance,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /loyalty/refund
  //
  // Full refund of a completed burn transaction.
  //
  //   points — creates a new ADJUSTMENT transaction, returns points to wallet.
  //            Original records are never modified — full audit trail preserved.
  //
  //   otp    — creates an ADJUSTMENT record for audit trail only.
  //            No wallet change since no points were ever deducted.
  //
  // Partial refund is NOT supported — always refunds 100% of burned points.
  // ═══════════════════════════════════════════════════════════════════════════
  async refund(tenantId: number, dto: RefundTransactionDto) {
    const tx = await this.txnRepo.findOne({
      where: {
        uuid: dto.transaction_id,
        type: WalletTransactionType.BURN,
        status: WalletTransactionStatus.ACTIVE,
      },
      relations: ['customer', 'wallet', 'business_unit', 'tenant'],
    });

    if (!tx) {
      throw new NotFoundException(
        'Transaction not found, or it is not in a refundable state. ' +
          'Only confirmed (ACTIVE) burn transactions can be refunded.',
      );
    }

    if (tx.tenant?.id !== tenantId) {
      throw new BadRequestException(
        'Transaction does not belong to this tenant',
      );
    }

    const isOtp = tx.business_unit?.type === 'otp';
    const pointsToReturn = tx.point_balance ?? 0;

    // Create an ADJUSTMENT record to document the refund regardless of type
    const refundTx = this.txnRepo.create({
      type: WalletTransactionType.ADJUSTMENT,
      status: WalletTransactionStatus.ACTIVE,
      wallet: isOtp ? null : ({ id: tx.wallet.id } as any),
      customer: { id: tx.customer.id } as any,
      business_unit: { id: tx.business_unit.id } as any,
      tenant: { id: tenantId } as any,
      amount: tx.amount,
      point_balance: pointsToReturn,
      source_type: 'checkout_refund',
      source_id: tx.id,          // link back to the original burn transaction
      invoice_id: tx.invoice_id, // carry over from original transaction
      invoice_no: tx.invoice_no, // carry over from original transaction
      created_at: new Date(),
      description: isOtp
        ? `Refund: OTP transaction ${tx.uuid}`
        : `Refund: returned ${pointsToReturn} points from transaction ${tx.uuid}`,
    });

    await this.txnRepo.save(refundTx);

    // For points programs — add the points back to the wallet
    if (!isOtp && pointsToReturn > 0) {
      const wallet = await this.walletRepo.findOne({ where: { id: tx.wallet.id } });
      wallet.available_balance += pointsToReturn;
      wallet.total_burned_points = Math.max(
        0,
        wallet.total_burned_points - pointsToReturn,
      );
      await this.walletRepo.save(wallet);

      return {
        refund_transaction_id: refundTx.uuid,
        original_transaction_id: tx.uuid,
        program_type: 'points',
        points_returned: pointsToReturn,
        new_available_points: wallet.available_balance,
      };
    }

    return {
      refund_transaction_id: refundTx.uuid,
      original_transaction_id: tx.uuid,
      program_type: 'otp',
      points_returned: 0,
      message: 'OTP transaction refunded. No points were involved.',
    };
  }
}
