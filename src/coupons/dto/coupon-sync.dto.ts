import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CouponDto {
  @IsString()
  @IsNotEmpty()
  code: string; // Unique identifier (required)

  @IsString()
  @IsNotEmpty()
  customer_phone_no: string; // (required)

  @IsString()
  @IsNotEmpty()
  invoice_no: string; // (required)

  @IsString()
  @IsNotEmpty()
  used_time: string; // (required) -> could use @IsDateString() if it's always ISO date
}

export class CouponSyncDto {
  @IsArray()
  @Type(() => CouponDto)
  coupons: CouponDto[];
}
