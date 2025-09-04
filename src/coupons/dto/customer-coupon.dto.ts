import { IsNotEmpty, IsNumber, IsUUID } from 'class-validator';

export class CustomerCouponsDto {
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsNumber()
  tenantId: number;

  @IsNumber()
  bUId: number;
}
