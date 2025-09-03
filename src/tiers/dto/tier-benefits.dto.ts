import { IsNotEmpty, IsNumber } from 'class-validator';

export class tierBenefitsDto {
  @IsNotEmpty()
  customerId: string;

  @IsNotEmpty()
  @IsNumber()
  tenantId: number;

  @IsNotEmpty()
  BUId: string;
}
