import { IsNumber, IsOptional, IsString } from 'class-validator';

export class getCouponCriteriasDto {
  @IsString()
  @IsOptional()
  coupon_code?: string;

  @IsNumber()
  tenantId: number;

  @IsNumber()
  bUId: number;
}
