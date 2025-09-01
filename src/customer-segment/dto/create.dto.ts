import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCustomerSegmentDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsString()
  name_ar: string;

  @IsNotEmpty()
  @IsString()
  description_ar: string;

  @IsNotEmpty()
  file: any; // you can later use `@IsObject()` or a custom validation pipe if needed

  @IsOptional()
  @IsArray()
  selected_customer_ids?: number[];
}

export class AddCustomerToSegmentDto {
  @IsNotEmpty()
  @IsNumber()
  customer_id: number;
}
