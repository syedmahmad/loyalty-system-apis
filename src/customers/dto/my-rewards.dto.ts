import { IsNotEmpty, IsNumber } from 'class-validator';

export class MyRewardsDto {
  @IsNotEmpty()
  customerId: string;

  @IsNotEmpty()
  @IsNumber()
  tenantId: number;

  @IsNotEmpty()
  BUId: string;
}
