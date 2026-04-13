import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED NOTE:
// tenantId is NOT in any DTO — it comes from the JWT Bearer token decoded by
// TenantApiTokenGuard and attached to req.loyaltyTenantId automatically.
//
// customer_phone is the raw Saudi mobile number.
// We normalise it (strip leading spaces/+, prepend +) then encrypt it to match
// the hashed_number stored in the customers table.
//
// program_uuid is the UUID of the business unit (loyalty program).
// End users don't know internal integer IDs — they receive the UUID from
// GET /loyalty/programs and pass it back in subsequent calls.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// GET /loyalty/burn-rule
//
// Returns the burn rule for a specific loyalty program + the customer's current
// available points. Optionally simulates how much they can burn on a given
// transaction amount.
//
// Only applicable to programs of type='points'.
// OTP-type programs (e.g. Qitaf) do not have a burn rule in our system.
// ─────────────────────────────────────────────────────────────────────────────
export class GetBurnRuleDto {
  @IsString()
  @IsNotEmpty()
  customer_phone: string; // e.g. "966501234567" or "+966501234567"

  @IsUUID()
  program_uuid: string; // UUID from GET /loyalty/programs → programs[].uuid

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  transaction_amount?: number; // optional — if provided, we simulate the max burn
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /loyalty/request-transaction
//
// Creates a pending (NOT_CONFIRMED) transaction — works for both program types:
//
//   points — validates wallet/rule, creates a burn placeholder.
//            Actual points_to_burn is decided at confirm-transaction time
//            (same pattern as the internal burning module).
//
//   otp    — no wallet or rule involved. Just logs the transaction amount so
//            there is an audit trail. The OTP redemption itself happens through
//            the Qitaf flow (/qitaf/redemption/*).
//
// Returns transaction_id that must be passed to confirm-transaction.
// ─────────────────────────────────────────────────────────────────────────────
export class RequestTransactionDto {
  @IsString()
  @IsNotEmpty()
  customer_phone: string;

  @IsUUID()
  program_uuid: string; // UUID from GET /loyalty/programs → programs[].uuid

  @IsNumber()
  @Min(0)
  transaction_amount: number; // full invoice/cart amount in SAR

  @IsOptional()
  @IsString()
  invoice_id?: string; // external invoice/order reference number

  @IsOptional()
  @IsString()
  remarks?: string; // free-text note (e.g. "customer VIP discount applied")

  @IsOptional()
  @IsString()
  from_app?: string; // which system/app is calling (e.g. "web-checkout", "pos-app")

  // ── OTP programs only (e.g. Qitaf) ──────────────────────────────────────
  // The ERP/POS machine knows its own STC-assigned branch and terminal IDs.
  // These are required when program type is 'otp', ignored for 'points'.
  @IsOptional()
  @IsString()
  branch_id?: string; // STC-assigned branch code for this store

  @IsOptional()
  @IsString()
  terminal_id?: string; // STC-assigned terminal code for this POS machine
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /loyalty/confirm-transaction
//
// Finalises a pending burn transaction.
// Called after payment is processed on the checkout side.
//
//   points — deducts points_to_burn from wallet, marks transaction ACTIVE.
//            points_to_burn can be <= what the burn-rule allows (customer may
//            decide to use fewer points than the maximum).
//
//   otp    — just marks the transaction ACTIVE. No wallet interaction.
//            Pass points_to_burn = 0 for OTP-type programs.
// ─────────────────────────────────────────────────────────────────────────────
export class ConfirmTransactionDto {
  @IsString()
  @IsNotEmpty()
  transaction_id: string; // UUID returned by request-transaction

  @IsInt()
  @Min(0)
  points_to_burn: number; // points to deduct from wallet (0 for OTP programs)

  // ── OTP programs only (e.g. Qitaf) ──────────────────────────────────────
  // otp: the 4-digit PIN the customer received via SMS — required for otp-type programs.
  // redeem_amount: SAR amount to pay using Qitaf points. Defaults to the full
  //   transaction_amount from request-transaction. If the customer only wants
  //   to use Qitaf for part of the invoice, pass the partial amount here.
  //   The difference (transaction_amount - redeem_amount) is auto-submitted
  //   to STC as an earn reward for what the customer paid in cash/card.
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(9999)
  otp?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  redeem_amount?: number; // SAR to redeem via Qitaf (defaults to full invoice amount)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /loyalty/refund
//
// Full refund using the ERP invoice/order reference.
// Works for both program types — the system figures out the type automatically:
//
//   points — looks up the wallet_transaction by invoice_id, returns points
//            to the customer's wallet via an ADJUSTMENT record.
//
//   otp    — looks up the Qitaf redemption by invoice_id, sends an exact
//            reverse to STC using the stored global_id + request_date.
//
// Partial refund is NOT supported — always reverses 100%.
// ─────────────────────────────────────────────────────────────────────────────
export class RefundTransactionDto {
  @IsString()
  @IsNotEmpty()
  invoice_id: string; // ERP invoice/order reference sent in request-transaction
}
