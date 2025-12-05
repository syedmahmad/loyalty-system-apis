import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
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

export class UpdateCustomerSegmentDto {
  @IsOptional()
  @IsArray()
  selected_customer_ids?: number[];

  @IsInt()
  @IsNotEmpty()
  business_unit_id: number;

  @IsInt()
  @IsNotEmpty()
  tenant_id: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCustomerSegmentLocalizationDto)
  locales?: CreateCustomerSegmentLocalizationDto[];
}
