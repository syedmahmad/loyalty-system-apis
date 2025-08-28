import { IsString, IsOptional, IsObject } from 'class-validator';

export class GvrEarnBurnWithEventsDto {
  @IsString()
  customer_id: string;

  @IsOptional()
  @IsObject()
  metadata?: {
    productitems: {
      totalamount?: string;
      products: Array<{
        store_id?: string;
        name?: string;
        productcode?: string;
        quantity?: string;
        amount?: number;
        unitprice?: string;
        unit?: string;
        [key: string]: any;
      }>;
    };
  };

  @IsString()
  tenantId: string;

  @IsString()
  BUId: string;
}
