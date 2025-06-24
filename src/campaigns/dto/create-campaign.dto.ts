import {
  IsNotEmpty,
  IsString,
  IsDateString,
  IsBoolean,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreateCampaignDto {
  @IsNumber()
  tenant_id: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  created_by?: number;

  rule_targets?: {
    rule_id: number;
  }[];
}
