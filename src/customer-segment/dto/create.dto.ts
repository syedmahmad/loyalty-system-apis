import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateCustomerSegmentLocalizationDto {
  @IsOptional()
  @IsInt()
  @IsNotEmpty()
  id?: number;

  @IsNotEmpty()
  @IsString()
  languageId: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
export class CreateCustomerSegmentDto {
  @IsNotEmpty()
  file: any; // you can later use `@IsObject()` or a custom validation pipe if needed

  @IsOptional()
  @IsArray()
  selected_customer_ids?: number[];

  @IsNumber()
  @IsOptional()
  business_unit_id: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerSegmentLocalizationDto)
  locales?: CreateCustomerSegmentLocalizationDto[];
}

export class AddCustomerToSegmentDto {
  @IsNotEmpty()
  @IsNumber()
  customer_id: number;
}
