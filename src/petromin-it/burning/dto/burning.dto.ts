import {
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';

/**
 * DTO (Data Transfer Object) for customer data request
 */
export class GetCustomerDataDto {
  // Unique ID coming from an external system (optional)
  @IsOptional()
  @IsString()
  custom_customer_unique_id?: string;

  // Customer phone number (required)
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString({ message: 'Phone number must be a string' })
  customer_phone_number: string;

  @IsOptional()
  @IsString()
  language_code: 'en' | 'ar';
}

export class BurnTransactionDto {
  //#region Customer Identifiers
  @IsOptional()
  @IsString()
  customer_id?: string; // UUID of the customer

  @IsOptional()
  @IsString()
  customer_phone_number?: string; // Phone number of the customer
  //#endregion

  //#region Transaction Details
  @IsNotEmpty()
  @IsNumber()
  transaction_amount: number; // Amount of the transaction

  @IsOptional()
  @IsString()
  from_app?: string; // External source of transaction (e.g., mobile app name)

  @IsOptional()
  @IsString()
  remarks?: string; // Additional description

  @IsOptional()
  @IsString()
  invoice_id?: string; // Additional description
  //#endregion
}

export class ConfirmBurnDto {
  @IsUUID()
  transaction_id: string;

  @IsInt()
  @Min(1)
  burn_point: number;

  @IsOptional()
  @IsString()
  coupon_code?: string;

  /**
   * Required when the tenant has otp_burn_required = 1.
   * The customer receives this OTP via push notification after request-transaction.
   */
  @IsOptional()
  @IsString()
  otp?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP BURN FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated The standalone OTP generate/verify flow has been replaced.
 * OTP is now generated automatically inside request-transaction and delivered
 * via push notification. The customer shares the OTP with the cashier who
 * includes it in confirm-transaction. These endpoints remain available but
 * are no longer part of the active integration flow.
 *
 * POST /burning/otp/generate  (App → Loyalty API)
 */
export class GenerateOtpDto {
  @IsNotEmpty()
  @IsString()
  customer_id: string;
}

/**
 * @deprecated See GenerateOtpDto deprecation note above.
 *
 * POST /burning/otp/verify  (MAC → Loyalty API)
 */
export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  otp: string;

  @IsNotEmpty()
  @IsString()
  customer_phone: string;
}
