import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  ValidateNested,
} from 'class-validator';

export class CreateCampaignLocalizationDto {
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
export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  business_unit_id: number;

  @IsNumber()
  @IsNotEmpty()
  client_id: number;

  @IsOptional()
  @IsString()
  description?: string;
  @IsArray()
  @IsNotEmpty()
  bu_ids: number[]; // Business Unit IDs

  @IsArray()
  @IsNotEmpty()
  rules: { rule_id: number }[];

  @IsArray()
  @IsNotEmpty()
  tiers: { tier_id: number; point_conversion_rate: number }[]; // Tier IDs from Tier table

  @IsArray()
  @IsNotEmpty()
  coupons: { coupon_id: number }[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  customer_segment_ids?: number[];

  @IsOptional()
  @IsNumber()
  created_by?: number;

  @IsOptional()
  @IsString()
  campaign_type?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCampaignLocalizationDto)
  locales?: CreateCampaignLocalizationDto[];
}
