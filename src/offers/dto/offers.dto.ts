import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class BenefitDto {
  @IsString()
  @IsNotEmpty()
  name_en: string;

  @IsString()
  @IsNotEmpty()
  name_ar: string;

  @IsString()
  @IsOptional()
  icon?: string;
}
class ImageLangDto {
  @IsOptional()
  @IsString()
  en?: string;

  @IsOptional()
  @IsString()
  ar?: string;
}

export class ImagesDto {
  @ValidateNested()
  @Type(() => ImageLangDto)
  desktop: ImageLangDto;

  @ValidateNested()
  @Type(() => ImageLangDto)
  mobile: ImageLangDto;
}

export class CreateOfferLocalizationDto {
  @IsOptional()
  @IsInt()
  @IsNotEmpty()
  id?: number;

  @IsNotEmpty()
  @IsString()
  languageId: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  term_and_condition?: string;

  @IsOptional()
  @IsString()
  desktop_image?: string;

  @IsOptional()
  @IsString()
  mobile_image?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BenefitDto)
  benefits?: BenefitDto[];
}

export class CreateOfferDto {
  @IsInt()
  @IsNotEmpty()
  @IsOptional()
  id?: number;

  @IsInt()
  tenant_id: number;

  @IsInt()
  business_unit_id: number;

  @IsString()
  @IsOptional()
  station_type?: string;

  @IsDateString()
  @IsOptional()
  date_from?: Date;

  @IsDateString()
  @IsOptional()
  date_to?: Date;

  @IsNumber()
  @IsOptional()
  status?: number;

  @IsInt()
  @IsOptional()
  external_system_id?: number;

  @IsInt()
  created_by?: number;

  @IsInt()
  updated_by?: number;

  @IsOptional()
  images?: ImagesDto;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  customer_segment_ids?: number[];

  @IsInt()
  all_users: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOfferLocalizationDto)
  locales?: CreateOfferLocalizationDto[];

  @IsNumber()
  @IsOptional()
  show_in_app?: number;
}

export class UpdateOfferDto extends PartialType(CreateOfferDto) {
  updated_by?: number;
}
