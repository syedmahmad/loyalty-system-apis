import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateWalletOrderDto {
  @IsInt()
  wallet_id?: number;

  @IsInt()
  business_unit_id?: number;

  @IsOptional()
  @IsString()
  order_id?: string;

  @IsNumber()
  @Type(() => Number)
  amount?: number;

  @IsNumber()
  @Type(() => Number)
  subtotal?: number;

  @IsNumber()
  @Type(() => Number)
  discount?: number;

  @IsOptional()
  @IsString()
  items?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  customer_remarks?: string;

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsString()
  category?: string;

  delivery_date?: Date;
  order_date?: Date;
}
