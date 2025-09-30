import {
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Min,
  Matches,
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

  @IsNotEmpty()
  @IsString()
  @Matches(/^(en|ar)$/, {
    message: "language_code must be either 'en' or 'ar'",
  })
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
