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

export class BenefitDto {
  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  name_en?: string;

  @IsOptional()
  @IsString()
  name_ar?: string;
}

export class CreateTierLocalizationDto {
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BenefitDto)
  benefits?: BenefitDto[];
}

export class CreateTierDto {
  @IsInt()
  @IsNotEmpty()
  @IsOptional()
  id?: number;

  @IsInt()
  tenant_id: number;

  @IsString()
  name: string;

  @IsString()
  name_ar: string;

  @IsInt()
  @Min(0)
  min_points: number;

  @IsInt()
  @Min(0)
  max_points: number;

  @IsInt()
  business_unit_id: number;
  // @Min(0)
  // points_conversion_rate: number;

  @IsString()
  @IsOptional()
  benefits?: string[];

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  description_ar?: string;

  created_by?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTierLocalizationDto)
  locales?: CreateTierLocalizationDto[];

  // rule_targets?: {
  //   rule_id: number;
  // }[];
}
