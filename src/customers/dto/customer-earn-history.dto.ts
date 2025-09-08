import { IsInt, IsNotEmpty } from 'class-validator';

export class CustomerEarnHistoryDto {
  @IsInt()
  @IsNotEmpty()
  customer_id: string;

  @IsInt()
  @IsNotEmpty()
  tenant_id: number;

  @IsInt()
  @IsNotEmpty()
  business_unit_id: number;
}
