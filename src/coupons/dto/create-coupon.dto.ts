import { IsInt, IsString, IsOptional, Min, IsArray } from 'class-validator';

export class CreateCouponDto {
  @IsInt()
  tenant_id: number;

  @IsString()
  code: string;

  @IsInt()
  @Min(0)
  discount_price: number;

  @IsInt()
  @Min(0)
  usage_limit: number;

  @IsInt()
  business_unit_id: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  customer_segment_ids?: number[];

  @IsString()
  @IsOptional()
  benefits?: string[];

  @IsString()
  @IsOptional()
  coupon_title_ar?: string;

  @IsString()
  @IsOptional()
  description_en?: string;

  @IsString()
  @IsOptional()
  description_ar?: string;

  @IsString()
  @IsOptional()
  terms_and_conditions_en?: string;

  @IsString()
  @IsOptional()
  terms_and_conditions_ar?: string;

  created_by?: number;
}
