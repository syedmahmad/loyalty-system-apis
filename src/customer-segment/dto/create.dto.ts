import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateCustomerSegmentDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  file: any; // you can later use `@IsObject()` or a custom validation pipe if needed
}

export class AddCustomerToSegmentDto {
  @IsNotEmpty()
  @IsNumber()
  customer_id: number;
}
