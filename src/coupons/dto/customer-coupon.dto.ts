import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CustomerCouponsDto {
  @IsUUID()
  @IsNotEmpty()
  customerId?: string;

  @IsString()
  @IsOptional()
  product?: string;

  @IsNumber()
  tenantId: number;

  @IsNumber()
  bUId: number;
}
