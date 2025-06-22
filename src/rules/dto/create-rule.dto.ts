import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRuleDto {
  @IsEnum(['earn', 'redeem', 'condition', 'downgrade'])
  type: 'earn' | 'redeem' | 'condition' | 'downgrade';

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

  targets: {
    target_type: 'tier' | 'campaign';
    target_id: number;
    id?: number; // Optional for updates
  }[];

  created_by: number;
}
