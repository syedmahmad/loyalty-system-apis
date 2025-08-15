import { IsString, IsOptional, IsObject } from 'class-validator';

export class BurnWithEvent {
  @IsString()
  customer_id: string;

  @IsString()
  event: string;

  @IsOptional()
  @IsObject()
  metadata?: {
    station_id?: string;
    fuel_type?: string;
    quantity?: string | number;
    amount?: number;
    [key: string]: any;
  };

  @IsString()
  tenantId: string;

  @IsString()
  BUId: string;
}
