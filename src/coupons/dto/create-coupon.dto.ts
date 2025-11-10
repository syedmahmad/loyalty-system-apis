import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsOptional,
  Min,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';

export class ConditionDto {
  @IsInt()
  id: number;

  @IsString()
  type: string;

  @IsString()
  operator: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsInt()
  tier?: number;

  @IsOptional()
  @IsInt()
  make?: number;

  @IsOptional()
  @IsInt()
  model?: number;

  @IsOptional()
  @IsInt()
  variant?: number;
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

export class CreateCouponLocalizationDto {
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
  @IsString()
  general_error?: string;

  @IsOptional()
  @IsString()
  exception_error?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BenefitDto)
  benefits?: BenefitDto[];
}

export class CreateCouponDto {
  @IsOptional()
  @IsInt()
  @IsNotEmpty()
  id?: number;

  @IsInt()
  tenant_id: number;

  @IsString()
  code: string;

  @IsInt()
  @Min(0)
  discount_price: number;

  @IsInt()
  @Min(0)
  usage_limit: number;

  @IsInt()
  business_unit_id: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  customer_segment_ids?: number[];

  @IsString()
  @IsOptional()
  benefits?: string[];

  @IsString()
  @IsOptional()
  coupon_title_ar?: string;

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

  created_by?: number;

  @IsInt()
  all_users: number;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions?: ConditionDto[];

  @IsOptional()
  images: ImagesDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCouponLocalizationDto)
  locales?: CreateCouponLocalizationDto[];
}
