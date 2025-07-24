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
  benefits?: string;

  created_by?: number;
}
