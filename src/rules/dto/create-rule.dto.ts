import {
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['earn', 'burn'])
  rule_type: string;

  @IsOptional()
  @IsNumber()
  min_transaction_amount?: number;

  @ValidateIf((o) => o.rule_type === 'earn' || o.rule_type === 'burn')
  @IsNumber()
  max_points_limit: number;

  @ValidateIf((o) => o.rule_type === 'earn')
  @IsNumber()
  earn_conversion_factor?: number;

  @ValidateIf((o) => o.rule_type === 'burn')
  @IsNumber()
  burn_factor?: number;

  @ValidateIf((o) => o.rule_type === 'burn')
  @IsNumber()
  max_burn_percent?: number;

  @ValidateIf((o) => o.rule_type === 'burn')
  @IsNumber()
  min_points_to_burn?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  created_by: number;
}
