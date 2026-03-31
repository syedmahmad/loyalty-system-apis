import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BASE
// All Qitaf requests use the same STC field names (PascalCase) so there is
// zero translation — we receive them and forward them as-is.
//
// Auth (tenant identity) comes from the JWT Bearer token in the Authorization
// header — NOT from the body. The guard decodes it and puts tenantId on req.
//
// BranchId + TerminalId are the values STC gave to each store location.
// Admin creates the terminal record in our DB; the cashier gets these IDs
// and sends them with every request. We validate they exist in our DB.
// ─────────────────────────────────────────────────────────────────────────────
class QitafBaseDto {
  @IsNumber()
  @IsPositive()
  Msisdn: number; // Customer's Saudi mobile, e.g. 500000000

  @IsString()
  @IsNotEmpty()
  BranchId: string; // STC-provided store/branch identifier

  @IsString()
  @IsNotEmpty()
  TerminalId: string; // STC-provided POS terminal identifier
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN GENERATION  — POST /qitaf/auth/token  (admin only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin calls this to generate a long-lived Bearer token for the POS system.
 * partner_id identifies which partner integration to issue the token for.
 */
export class GenerateQitafTokenDto {
  @IsInt()
  @Min(1)
  tenant_id: number;

  @IsInt()
  @Min(1)
  partner_id: number;
}

/**
 * Query params for retrieving the stored POS API token.
 */
export class GetQitafTokenDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tenant_id: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  partner_id: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. REDEMPTION OTP  — POST /qitaf/redemption/otp
// ─────────────────────────────────────────────────────────────────────────────
export class RedemptionOtpDto extends QitafBaseDto {}

// ─────────────────────────────────────────────────────────────────────────────
// 2. REDEEM QITAF POINTS  — POST /qitaf/redemption/redeem
// ─────────────────────────────────────────────────────────────────────────────
export class RedemptionRedeemDto extends QitafBaseDto {
  @IsInt()
  @Min(1000)
  PIN: number; // 4-digit OTP the customer received in their SMS

  @IsInt()
  @Min(1)
  Amount: number; // Purchase amount in SAR (whole number, no decimals)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REVERSE QITAF REDEEM  — PUT /qitaf/redemption/reverse
// ─────────────────────────────────────────────────────────────────────────────
export class RedemptionReverseDto extends QitafBaseDto {
  @IsString()
  @IsNotEmpty()
  RefRequestId: string; // GlobalId returned by the original /redemption/redeem call

  @IsString()
  @IsNotEmpty()
  RefRequestDate: string; // RequestDate returned by the original /redemption/redeem call
}

// ─────────────────────────────────────────────────────────────────────────────
// 3b. REVERSE BY MSISDN  — PUT /qitaf/redemption/reverse-by-msisdn
//
// Cashier-friendly alternative to the manual reverse endpoint above.
// The cashier only needs the customer's phone number — no UUID or date needed.
// The system looks up our DB to find the last successful redeem for that phone
// and fills in RefRequestId + RefRequestDate automatically.
// ─────────────────────────────────────────────────────────────────────────────
export class ReversalByMsisdnDto {
  @IsNumber()
  @IsPositive()
  Msisdn: number; // Customer's Saudi mobile number, e.g. 500000000

  @IsString()
  @IsNotEmpty()
  BranchId: string; // STC-provided branch/store identifier

  @IsString()
  @IsNotEmpty()
  TerminalId: string; // STC-provided POS terminal identifier
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. EARN REWARD  — POST /qitaf/earn/reward
// ─────────────────────────────────────────────────────────────────────────────
export class EarnRewardDto extends QitafBaseDto {
  @IsInt()
  @Min(1)
  Amount: number; // Purchase amount in SAR — STC converts to points
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. EARN REWARD INCENTIVE  — POST /qitaf/earn/reward-incentive
// ─────────────────────────────────────────────────────────────────────────────
export class EarnRewardIncentiveDto extends QitafBaseDto {
  @IsInt()
  @Min(1)
  Amount: number;

  @IsString()
  @IsNotEmpty()
  CashierId: string; // Cashier ID given by STC — enables cashier incentive program
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. UPDATE REWARD  — PUT /qitaf/earn/update
// ─────────────────────────────────────────────────────────────────────────────
export class EarnUpdateDto extends QitafBaseDto {
  @IsString()
  @IsNotEmpty()
  RefRequestId: string; // GlobalId of the original Reward transaction

  @IsString()
  @IsNotEmpty()
  RefRequestDate: string; // RequestDate of the original Reward transaction

  @IsInt()
  @Min(1)
  ReductionAmount: number; // SAR amount to deduct from the original reward
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REWARD TRANSACTION STATUS  — POST /qitaf/earn/reward/status
// Note: BranchId and TerminalId are NOT required by STC for status check.
// ─────────────────────────────────────────────────────────────────────────────
export class EarnRewardStatusDto {
  @IsNumber()
  @IsPositive()
  Msisdn: number;

  @IsString()
  @IsNotEmpty()
  RefRequestId: string; // GlobalId of the Reward transaction to check

  @IsString()
  @IsNotEmpty()
  RefRequestDate: string; // RequestDate of the Reward transaction to check
}
