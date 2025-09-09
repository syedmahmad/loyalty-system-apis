// create-customer-activity-record.dto.ts
import { IsObject, IsOptional, IsString } from 'class-validator';

export class EarnWithEvent {
  @IsString()
  customer_id: string;

  @IsString()
  event: string;

  @IsOptional()
  @IsObject()
  metadata?: {
    store_id?: string;
    name?: string;
    quantity?: string | number;
    amount?: number;
    [key: string]: any;
  };

  @IsString()
  tenantId: string;

  @IsString()
  BUId: string;
}
