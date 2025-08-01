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
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsIn(['event based earn', 'spend and earn', 'burn', 'dynamic rule'])
  rule_type: string;

  @IsOptional()
  @IsNumber()
  min_amount_spent?: number;

  @IsNumber()
  @IsNotEmpty()
  client_id: number;

  @ValidateIf(
    (o) =>
      o.rule_type === 'event based earn' ||
      o.rule_type === 'spend and earn' ||
      o.rule_type === 'dynamic rule',
  )
  @IsNumber()
  reward_points?: number;

  @ValidateIf((o) => o.rule_type === 'event based earn')
  @IsString()
  event_triggerer?: string; // e.g., 'signup', 'birthday'

  @ValidateIf((o) => o.rule_type === 'burn')
  @IsNumber()
  max_redeemption_points_limit?: number;

  @ValidateIf((o) => o.rule_type === 'burn')
  @IsNumber()
  points_conversion_factor?: number;

  @ValidateIf((o) => o.rule_type === 'burn')
  @IsNumber()
  max_burn_percent_on_invoice?: number;

  @IsOptional()
  @IsString()
  condition_type?: string;

  @IsOptional()
  @IsString()
  condition_operator?: string;

  @IsOptional()
  @IsString()
  condition_value?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  validity_after_assignment: number;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  burn_type?: string;

  @IsNumber()
  created_by: number;
}
