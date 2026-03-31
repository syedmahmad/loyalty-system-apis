import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
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
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /loyalty/refund
//
// Full refund of a completed burn transaction.
// Points are returned to the customer's wallet via a new ADJUSTMENT transaction.
// Partial refund is NOT supported — always returns 100% of burned points.
// For OTP-type programs, no wallet adjustment is made (no points were deducted).
// ─────────────────────────────────────────────────────────────────────────────
export class RefundTransactionDto {
  @IsString()
  @IsNotEmpty()
  transaction_id: string; // UUID of the original confirm-transaction call
}
