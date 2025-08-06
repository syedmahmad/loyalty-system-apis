// create-customer-activity-record.dto.ts
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsObject,
} from 'class-validator';

export class CustomerEarnDto {
  @IsString()
  customer_id: string;

  @IsOptional()
  @IsString()
  campaign_id?: string;

  @IsOptional()
  @IsEnum(['rule', 'campaign', 'coupon'], {
    message: 'campaign_type must be one of: rule, campaign, coupon',
  })
  campaign_type?: 'rule' | 'campaign' | 'coupon';

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
