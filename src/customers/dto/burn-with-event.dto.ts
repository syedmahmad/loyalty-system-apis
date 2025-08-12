import { IsString, IsOptional, IsObject } from 'class-validator';

export class BurnWithEvent {
  @IsString()
  customer_id: string;

  @IsString()
  event: string;

  @IsOptional()
  @IsObject()
  metadata?: {
    store_id?: string;
    product_type?: string;
    quantity?: string | number;
    amount?: number;
    [key: string]: any;
  };
}
