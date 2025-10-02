import { IsString, IsObject } from 'class-validator';

export class GvrEarnBurnWithEventsDto {
  @IsString()
  customer_id: string;

  @IsObject()
  metadata?: {
    store_id: string;
    invoice_id: string;
    invoice_no: string;
    invoice_amount: number;
    invoice_date: string;
    productitems: {
      products: Array<{
        name: string;
        quantity: string;
        amount: number;
        productcode?: string;
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
