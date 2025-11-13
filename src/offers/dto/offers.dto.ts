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

export class CreateOfferDto {
  @IsInt()
  tenant_id: number;

  @IsInt()
  business_unit_id: number;

  @IsString()
  @IsNotEmpty()
  offer_title: string;

  @IsString()
  @IsOptional()
  offer_title_ar?: string;

  @IsString()
  @IsNotEmpty()
  offer_subtitle: string;

  @IsString()
  @IsOptional()
  offer_subtitle_ar?: string;

  @IsString()
  @IsOptional()
  station_type?: string;

  @IsDateString()
  @IsOptional()
  date_from?: Date;

  @IsDateString()
  @IsOptional()
  date_to?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BenefitDto)
  @IsOptional()
  benefits?: BenefitDto[];

  @IsNumber()
  @IsOptional()
  status?: number;

  @IsString()
  @IsOptional()
  description_en?: string;

  @IsString()
  @IsOptional()
  description_ar?: string;

  @IsString()
  @IsOptional()
  terms_and_conditions_en?: string;

  @IsString()
  @IsOptional()
  terms_and_conditions_ar?: string;

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

  @IsNumber()
  @IsOptional()
  show_in_app?: number;
}

export class UpdateOfferDto extends PartialType(CreateOfferDto) {
  updated_by?: number;
}
