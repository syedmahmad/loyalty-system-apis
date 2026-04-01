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
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP BURN FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /burning/otp/generate  (App → Loyalty API)
 *
 * Customer taps "Get OTP" on the burn screen.
 * Returns a 6-digit OTP + expiry shown with a countdown timer.
 * No points selection needed here — MAC reads the wallet balance after
 * verifying the OTP and handles point selection as normal.
 */
export class GenerateOtpDto {
  @IsNotEmpty()
  @IsString()
  customer_id: string; // customer UUID (same field used by notifications, preferences, etc.)
}

/**
 * POST /burning/otp/verify  (MAC → Loyalty API)
 *
 * Cashier types the OTP shown on the customer's phone screen.
 * Returns customer info + authorised points + discount amount.
 * MAC then calls request-transaction with these values.
 */
export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  otp: string; // 6-digit code from customer's screen

  @IsNotEmpty()
  @IsString()
  customer_phone: string; // customer's mobile number (cashier reads it from screen or types it)
}
