// create-customer-activity-record.dto.ts
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export class CustomerEarnDto {
  @IsString()
  customer_id: string;

  @IsOptional()
  @IsString()
  campaign_id?: string;

  @IsOptional()
  @IsEnum(['DISCOUNT_POINTS', 'DISCOUNT_COUPONS'], {
    message: 'campaign_type must be one of: DISCOUNT_POINTS, DISCOUNT_COUPONS',
  })
  campaign_type?: 'DISCOUNT_POINTS' | 'DISCOUNT_COUPONS';

  @IsOptional()
  @IsObject()
  coupon_info?: Record<string, any>;

  @IsOptional()
  @IsObject()
  rule_info?: Record<string, any>;

  @IsOptional()
  @IsObject()
  order?: Record<string, any>;
}
