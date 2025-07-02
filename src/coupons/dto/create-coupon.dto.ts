import { IsInt, IsString, IsOptional, Min } from 'class-validator';

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

  @IsString()
  @IsOptional()
  benefits?: string;

  created_by?: number;
}
