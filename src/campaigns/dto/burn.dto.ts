import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderDto {
  @IsOptional()
  @IsString()
  order_id?: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsNumber()
  subtotal?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsNumber()
  items_count?: number;

  @IsOptional()
  @IsArray()
  items?: any[]; // You can define a stricter type if needed

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

  @IsOptional()
  @IsDateString()
  delivery_date?: string;

  @IsOptional()
  @IsDateString()
  order_date?: string;
}

export class BurnWithCampaignDto {
  @IsNotEmpty()
  @IsString()
  customer_id: string;

  @IsNotEmpty()
  @IsString()
  campaign_id: string;

  @IsNotEmpty()
  @IsString()
  rule_id: string;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderDto)
  order: OrderDto;
}

export class BurnPoints {
  @IsNotEmpty()
  @IsString()
  customer_id: string;

  @IsNotEmpty()
  @IsString()
  rule_id: string;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => OrderDto)
  order: OrderDto;
}
