import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRuleDto {
  @IsString()
  type: string;

  @IsString()
  condition_type: string;

  @IsString()
  operator: string;

  @IsNumber()
  value: number;

  @IsOptional()
  @IsNumber()
  reward_value?: number;

  @IsOptional()
  @IsString()
  unit_type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  created_by: number;
}
