import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @IsOptional()
  coupon_code?: string;

  @IsNumber()
  tenantId: number;

  @IsNumber()
  bUId: number;
}
